import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import {
    BillingProvider,
    InvoiceKind,
    InvoiceStatus,
    PlanPeriod,
    Prisma,
    SubscriptionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../../common/config/config.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageAggregationService } from '../usage/usage-aggregation.service';
import { StripePaymentProvider } from './payment/stripe-payment.provider';
import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class BillingOverageCollectionService
    implements OnModuleInit, OnModuleDestroy
{
    private static readonly LEASE_NAME = 'billing:overage-collection';
    private readonly logger = new Logger(BillingOverageCollectionService.name);
    private readonly leaseOwnerId = randomUUID();
    private intervalHandle: NodeJS.Timeout | null = null;
    private isRunning = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: AppConfigService,
        private readonly usageAggregationService: UsageAggregationService,
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
        }, this.configService.billingOverageCollectionIntervalSeconds * 1000);
        this.intervalHandle.unref?.();
    }

    onModuleDestroy(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    async processDueOverageCollection(): Promise<{
        materialized: number;
        collected: number;
        failed: number;
    }> {
        if (!this.shouldRun()) {
            return {
                materialized: 0,
                collected: 0,
                failed: 0,
            };
        }

        const leaseAcquired = await this.tryAcquireLease();
        if (!leaseAcquired) {
            return {
                materialized: 0,
                collected: 0,
                failed: 0,
            };
        }

        const now = new Date();
        const dueSourceInvoices = await this.prisma.invoice.findMany({
            where: {
                paymentProvider: BillingProvider.STRIPE,
                kind: InvoiceKind.SUBSCRIPTION,
                status: InvoiceStatus.PAID,
                overageProcessedAt: null,
                periodEnd: {
                    lte: now,
                },
            },
            orderBy: [
                {
                    periodEnd: 'asc',
                },
                {
                    createdAt: 'asc',
                },
            ],
            take: this.configService.billingOverageCollectionBatchSize,
            select: {
                id: true,
            },
        });

        let materialized = 0;
        let collected = 0;
        let failed = 0;

        for (const invoice of dueSourceInvoices) {
            try {
                const processed = await this.materializeSourceInvoice(
                    invoice.id,
                    now,
                );
                if (processed) {
                    materialized += 1;
                }
            } catch (error) {
                failed += 1;
                this.logger.warn(
                    `Failed to materialize overage for source invoice ${invoice.id}: ${this.describeError(
                        error,
                    )}`,
                );
            }
        }

        const pendingOverageInvoices = await this.prisma.invoice.findMany({
            where: {
                paymentProvider: BillingProvider.STRIPE,
                kind: InvoiceKind.OVERAGE,
                status: InvoiceStatus.DRAFT,
                externalInvoiceId: null,
            },
            orderBy: {
                createdAt: 'asc',
            },
            take: this.configService.billingOverageCollectionBatchSize,
            select: {
                id: true,
            },
        });

        for (const invoice of pendingOverageInvoices) {
            try {
                const processed = await this.collectOverageInvoice(invoice.id);
                if (processed) {
                    collected += 1;
                }
            } catch (error) {
                failed += 1;
                this.logger.warn(
                    `Failed to collect overage invoice ${invoice.id}: ${this.describeError(
                        error,
                    )}`,
                );
            }
        }

        return {
            materialized,
            collected,
            failed,
        };
    }

    private async tryAcquireLease(): Promise<boolean> {
        const now = new Date();
        const expiresAt = new Date(
            now.getTime() + this.getLeaseDurationMilliseconds(),
        );

        try {
            return await this.prisma.$transaction(
                async (tx) => {
                    const lease = await tx.backgroundJobLease.findUnique({
                        where: {
                            name: BillingOverageCollectionService.LEASE_NAME,
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
                                    name: BillingOverageCollectionService.LEASE_NAME,
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
                            name: BillingOverageCollectionService.LEASE_NAME,
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
        } catch (error) {
            if (this.isRetryableTransactionError(error)) {
                return false;
            }

            throw error;
        }
    }

    private async runScheduledCycle(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        try {
            await this.processDueOverageCollection();
        } catch (error) {
            this.logger.warn(
                `Failed to run overage collection cycle: ${this.describeError(
                    error,
                )}`,
            );
        } finally {
            this.isRunning = false;
        }
    }

    private async materializeSourceInvoice(
        sourceInvoiceId: string,
        processedAt: Date,
    ): Promise<boolean> {
        return this.prisma.$transaction(
            async (tx) => {
                const invoice = await tx.invoice.findUnique({
                    where: { id: sourceInvoiceId },
                    select: {
                        id: true,
                        kind: true,
                        status: true,
                        paymentProvider: true,
                        currency: true,
                        periodStart: true,
                        periodEnd: true,
                        overageProcessedAt: true,
                        derivedOverageInvoice: {
                            select: {
                                id: true,
                            },
                        },
                        subscription: {
                            select: {
                                id: true,
                                status: true,
                                paymentProvider: true,
                                externalSubscriptionId: true,
                                currentPeriodEnd: true,
                                cancelAtPeriodEnd: true,
                                user: {
                                    select: {
                                        id: true,
                                        email: true,
                                    },
                                },
                                plan: {
                                    select: {
                                        name: true,
                                        priceCents: true,
                                        currency: true,
                                        period: true,
                                        quotaRequests: true,
                                        allowOverage: true,
                                        overageUnitRequests: true,
                                        overagePriceCents: true,
                                        product: {
                                            select: {
                                                title: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                });

                if (
                    !invoice ||
                    invoice.kind !== InvoiceKind.SUBSCRIPTION ||
                    invoice.status !== InvoiceStatus.PAID ||
                    invoice.paymentProvider !== BillingProvider.STRIPE ||
                    invoice.overageProcessedAt
                ) {
                    return false;
                }

                const usedRequests =
                    await this.usageAggregationService.sumUsageForWindow(
                        {
                            subscriptionId: invoice.subscription.id,
                            periodStart: invoice.periodStart,
                            periodEnd: invoice.periodEnd,
                        },
                        tx,
                    );
                const settlement = this.buildSettlement(
                    invoice.subscription.plan,
                    usedRequests,
                );

                if (
                    settlement.amountCents > 0 &&
                    !invoice.derivedOverageInvoice
                ) {
                    await tx.invoice.create({
                        data: {
                            subscriptionId: invoice.subscription.id,
                            paymentProvider: BillingProvider.STRIPE,
                            kind: InvoiceKind.OVERAGE,
                            overageSourceInvoiceId: invoice.id,
                            overageRequests: settlement.overageRequests,
                            overageUnits: settlement.overageUnits,
                            amountCents: settlement.amountCents,
                            currency:
                                invoice.subscription.plan.currency ??
                                invoice.currency,
                            status: InvoiceStatus.DRAFT,
                            periodStart: invoice.periodStart,
                            periodEnd: invoice.periodEnd,
                        },
                    });
                }

                if (
                    this.isLocalManagedStripeSubscription(invoice.subscription)
                ) {
                    if (invoice.subscription.cancelAtPeriodEnd) {
                        await tx.subscription.update({
                            where: {
                                id: invoice.subscription.id,
                            },
                            data: {
                                status: SubscriptionStatus.CANCELED,
                                cancelAtPeriodEnd: false,
                                gracePeriodEndsAt: null,
                            },
                        });
                    } else if (
                        invoice.subscription.status !==
                        SubscriptionStatus.CANCELED
                    ) {
                        const nextPeriodStart = invoice.periodEnd;
                        const nextPeriodEnd = this.addPlanPeriod(
                            nextPeriodStart,
                            invoice.subscription.plan.period,
                        );

                        await tx.invoice.create({
                            data: {
                                subscriptionId: invoice.subscription.id,
                                paymentProvider: BillingProvider.STRIPE,
                                kind: InvoiceKind.SUBSCRIPTION,
                                amountCents: invoice.subscription.plan.priceCents,
                                currency:
                                    invoice.subscription.plan.currency ??
                                    invoice.currency,
                                status: InvoiceStatus.PAID,
                                periodStart: nextPeriodStart,
                                periodEnd: nextPeriodEnd,
                            },
                        });

                        await tx.subscription.update({
                            where: {
                                id: invoice.subscription.id,
                            },
                            data: {
                                status: SubscriptionStatus.ACTIVE,
                                currentPeriodStart: nextPeriodStart,
                                currentPeriodEnd: nextPeriodEnd,
                                gracePeriodEndsAt: null,
                            },
                        });
                    }
                }

                await tx.invoice.update({
                    where: {
                        id: invoice.id,
                    },
                    data: {
                        overageProcessedAt: processedAt,
                    },
                });

                return true;
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            },
        );
    }

    private async collectOverageInvoice(invoiceId: string): Promise<boolean> {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: invoiceId },
            select: {
                id: true,
                kind: true,
                status: true,
                externalInvoiceId: true,
                amountCents: true,
                currency: true,
                periodStart: true,
                periodEnd: true,
                overageRequests: true,
                overageUnits: true,
                subscription: {
                    select: {
                        externalSubscriptionId: true,
                        user: {
                            select: {
                                id: true,
                                email: true,
                            },
                        },
                        plan: {
                            select: {
                                name: true,
                                product: {
                                    select: {
                                        title: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (
            !invoice ||
            invoice.kind !== InvoiceKind.OVERAGE ||
            invoice.status !== InvoiceStatus.DRAFT ||
            invoice.externalInvoiceId
        ) {
            return false;
        }

        const result = await this.stripePaymentProvider.createManagedInvoice({
            invoiceId: invoice.id,
            externalSubscriptionId:
                invoice.subscription.externalSubscriptionId ?? undefined,
            userId: invoice.subscription.user.id,
            userEmail: invoice.subscription.user.email,
            amountCents: invoice.amountCents,
            currency: invoice.currency,
            description: this.buildOverageDescription(invoice),
            periodStart: invoice.periodStart,
            periodEnd: invoice.periodEnd,
        });

        if (result.status === 'PAID') {
            await this.subscriptionsService.markInvoicePaid({
                invoiceId: invoice.id,
                paymentProvider: 'STRIPE',
                externalInvoiceId: result.externalInvoiceId,
                externalSubscriptionId: result.externalSubscriptionId,
                attemptCount: result.attemptCount,
            });

            return true;
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

        return true;
    }

    private shouldRun(): boolean {
        return (
            this.configService.paymentProvider === 'STRIPE' &&
            this.configService.billingOverageCollectionEnabled
        );
    }

    private getLeaseDurationMilliseconds(): number {
        return (
            Math.max(
                this.configService.billingOverageCollectionIntervalSeconds * 2,
                60,
            ) * 1000
        );
    }

    private buildSettlement(
        plan: {
            quotaRequests: number;
            allowOverage: boolean;
            overageUnitRequests: number | null;
            overagePriceCents: number | null;
        },
        usedRequests: number,
    ): {
        overageRequests: number;
        overageUnits: number;
        amountCents: number;
    } {
        if (
            !plan.allowOverage ||
            !plan.overageUnitRequests ||
            !plan.overagePriceCents ||
            usedRequests <= plan.quotaRequests
        ) {
            return {
                overageRequests: 0,
                overageUnits: 0,
                amountCents: 0,
            };
        }

        const overageRequests = usedRequests - plan.quotaRequests;
        const overageUnits = Math.ceil(
            overageRequests / plan.overageUnitRequests,
        );

        return {
            overageRequests,
            overageUnits,
            amountCents: overageUnits * plan.overagePriceCents,
        };
    }

    private isLocalManagedStripeSubscription(subscription: {
        paymentProvider: BillingProvider;
        externalSubscriptionId: string | null;
        currentPeriodEnd: Date | null;
        plan: {
            priceCents: number;
        };
    }): boolean {
        if (
            subscription.paymentProvider !== BillingProvider.STRIPE ||
            subscription.externalSubscriptionId ||
            subscription.plan.priceCents !== 0
        ) {
            return false;
        }

        return Boolean(subscription.currentPeriodEnd);
    }

    private addPlanPeriod(periodStart: Date, period: PlanPeriod): Date {
        const periodEnd = new Date(periodStart);

        if (period === PlanPeriod.MONTH) {
            periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
        }

        return periodEnd;
    }

    private buildOverageDescription(invoice: {
        overageRequests: number | null;
        overageUnits: number | null;
        subscription: {
            plan: {
                name: string;
                product: {
                    title: string;
                };
            };
        };
        periodStart: Date;
        periodEnd: Date;
    }): string {
        const suffix =
            invoice.overageRequests && invoice.overageUnits
                ? ` (${invoice.overageRequests} requests across ${invoice.overageUnits} units)`
                : '';

        return `Overage charges for ${invoice.subscription.plan.product.title} / ${invoice.subscription.plan.name} from ${invoice.periodStart.toISOString()} to ${invoice.periodEnd.toISOString()}${suffix}`;
    }

    private describeError(error: unknown): string {
        if (error instanceof Error && error.message.trim().length > 0) {
            return error.message;
        }

        return 'Unknown overage collection error';
    }

    private isRetryableTransactionError(error: unknown): boolean {
        const prismaError = error as {
            code?: string;
        };

        return prismaError?.code === 'P2034';
    }
}
