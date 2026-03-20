import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import {
    BillingProvider,
    InvoiceStatus,
    Prisma,
    SubscriptionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../../common/config/config.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createManagedRetryStateAfterAttempt } from './billing-managed-retry.policy';
import { StripePaymentProvider } from './payment/stripe-payment.provider';
import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class BillingManagedRetryService
    implements OnModuleInit, OnModuleDestroy
{
    private static readonly LEASE_NAME = 'billing:managed-retry';
    private readonly logger = new Logger(BillingManagedRetryService.name);
    private readonly leaseOwnerId = randomUUID();
    private intervalHandle: NodeJS.Timeout | null = null;
    private isRunning = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: AppConfigService,
        private readonly stripePaymentProvider: StripePaymentProvider,
        private readonly subscriptionsService: SubscriptionsService,
    ) {}

    onModuleInit(): void {
        if (!this.shouldRun()) {
            return;
        }

        void this.runScheduledCycle();

        this.intervalHandle = setInterval(() => {
            void this.runScheduledCycle();
        }, this.configService.billingManagedRetryIntervalSeconds * 1000);
        this.intervalHandle.unref?.();
    }

    onModuleDestroy(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    async processDueRetries(): Promise<{
        processed: number;
        failed: number;
    }> {
        if (!this.shouldRun()) {
            return {
                processed: 0,
                failed: 0,
            };
        }

        const leaseAcquired = await this.tryAcquireLease();
        if (!leaseAcquired) {
            return {
                processed: 0,
                failed: 0,
            };
        }

        const now = new Date();
        const invoices = await this.prisma.invoice.findMany({
            where: {
                paymentProvider: BillingProvider.STRIPE,
                status: InvoiceStatus.PAST_DUE,
                externalInvoiceId: {
                    not: null,
                },
                managedRetryExhaustedAt: null,
                OR: [
                    {
                        managedNextRetryAt: {
                            lte: now,
                        },
                    },
                    {
                        managedNextRetryAt: null,
                        managedRetryCount: 0,
                    },
                ],
                subscription: {
                    status: SubscriptionStatus.PAST_DUE,
                    currentPeriodStart: {
                        not: null,
                    },
                },
            },
            orderBy: [
                {
                    managedNextRetryAt: 'asc',
                },
                {
                    createdAt: 'asc',
                },
            ],
            take: this.configService.billingManagedRetryBatchSize,
            select: {
                id: true,
                externalInvoiceId: true,
                managedRetryCount: true,
            },
        });

        let processed = 0;
        let failed = 0;

        for (const invoice of invoices) {
            if (!invoice.externalInvoiceId) {
                continue;
            }

            try {
                await this.processInvoiceRetry({
                    ...invoice,
                    externalInvoiceId: invoice.externalInvoiceId,
                });
                processed += 1;
            } catch (error) {
                failed += 1;
                this.logger.warn(
                    `Failed to retry renewal invoice ${invoice.id}: ${this.describeError(
                        error,
                    )}`,
                );
            }
        }

        return {
            processed,
            failed,
        };
    }

    private async tryAcquireLease(): Promise<boolean> {
        const now = new Date();
        const expiresAt = new Date(
            now.getTime() + this.getLeaseDurationMilliseconds(),
        );

        return this.prisma.$transaction(
            async (tx) => {
                const lease = await tx.backgroundJobLease.findUnique({
                    where: {
                        name: BillingManagedRetryService.LEASE_NAME,
                    },
                    select: {
                        ownerId: true,
                        expiresAt: true,
                    },
                });

                if (!lease) {
                    try {
                        await tx.backgroundJobLease.create({
                            data: {
                                name: BillingManagedRetryService.LEASE_NAME,
                                ownerId: this.leaseOwnerId,
                                expiresAt,
                            },
                        });

                        return true;
                    } catch (error) {
                        if (
                            error instanceof
                                Prisma.PrismaClientKnownRequestError &&
                            error.code === 'P2002'
                        ) {
                            return false;
                        }

                        throw error;
                    }
                }

                if (
                    lease.ownerId !== this.leaseOwnerId &&
                    lease.expiresAt > now
                ) {
                    return false;
                }

                const updated = await tx.backgroundJobLease.updateMany({
                    where: {
                        name: BillingManagedRetryService.LEASE_NAME,
                        ownerId: lease.ownerId,
                        expiresAt: lease.expiresAt,
                    },
                    data: {
                        ownerId: this.leaseOwnerId,
                        expiresAt,
                    },
                });

                return updated.count === 1;
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            },
        );
    }

    private async runScheduledCycle(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        try {
            await this.processDueRetries();
        } finally {
            this.isRunning = false;
        }
    }

    private async processInvoiceRetry(invoice: {
        id: string;
        externalInvoiceId: string;
        managedRetryCount: number;
    }): Promise<void> {
        const attemptedAt = new Date();

        try {
            const result = await this.stripePaymentProvider.retryInvoicePayment({
                externalInvoiceId: invoice.externalInvoiceId,
            });

            if (result.status === 'PAID') {
                await this.subscriptionsService.markInvoicePaid({
                    invoiceId: invoice.id,
                    paymentProvider: 'STRIPE',
                    externalInvoiceId: result.externalInvoiceId,
                    externalSubscriptionId: result.externalSubscriptionId,
                    attemptCount: result.attemptCount,
                });
                return;
            }

            await this.subscriptionsService.markInvoiceFailed({
                invoiceId: invoice.id,
                paymentProvider: 'STRIPE',
                externalInvoiceId: result.externalInvoiceId,
                externalSubscriptionId: result.externalSubscriptionId,
                invoiceStatus:
                    result.status === 'VOID'
                        ? InvoiceStatus.VOID
                        : InvoiceStatus.PAST_DUE,
                attemptCount: result.attemptCount,
                nextPaymentAttemptAt: result.nextPaymentAttemptAt,
            });

            if (result.status === 'PAST_DUE') {
                await this.prisma.invoice.update({
                    where: {
                        id: invoice.id,
                    },
                    data: createManagedRetryStateAfterAttempt(
                        invoice.managedRetryCount,
                        attemptedAt,
                        this.configService.billingManagedRetryDelaysMinutes,
                    ),
                });
            }
        } catch (error) {
            await this.prisma.invoice.update({
                where: {
                    id: invoice.id,
                },
                data: createManagedRetryStateAfterAttempt(
                    invoice.managedRetryCount,
                    attemptedAt,
                    this.configService.billingManagedRetryDelaysMinutes,
                    this.describeError(error),
                ),
            });

            throw error;
        }
    }

    private shouldRun(): boolean {
        return (
            this.configService.paymentProvider === 'STRIPE' &&
            this.configService.billingManagedRetryEnabled
        );
    }

    private getLeaseDurationMilliseconds(): number {
        return (
            Math.max(
                this.configService.billingManagedRetryIntervalSeconds * 2,
                60,
            ) * 1000
        );
    }

    private describeError(error: unknown): string {
        if (error instanceof Error && error.message.trim().length > 0) {
            return error.message;
        }

        return 'Unknown renewal retry error';
    }
}
