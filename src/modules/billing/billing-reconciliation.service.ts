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
import Stripe from 'stripe';
import { AppConfigService } from '../../common/config/config.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StripeClientService } from './payment/stripe-client.service';
import { extractStripeSubscriptionPeriod } from './stripe-subscription-period';
import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class BillingReconciliationService
    implements OnModuleInit, OnModuleDestroy
{
    private static readonly LEASE_NAME = 'billing:stripe-reconciliation';
    private readonly logger = new Logger(BillingReconciliationService.name);
    private readonly leaseOwnerId = randomUUID();
    private intervalHandle: NodeJS.Timeout | null = null;
    private isRunning = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: AppConfigService,
        private readonly stripeClientService: StripeClientService,
        private readonly subscriptionsService: SubscriptionsService,
    ) {}

    onModuleInit(): void {
        if (!this.shouldRun()) {
            return;
        }

        void this.runScheduledCycle();

        this.intervalHandle = setInterval(() => {
            void this.runScheduledCycle();
        }, this.configService.billingReconciliationIntervalSeconds * 1000);
        this.intervalHandle.unref?.();
    }

    onModuleDestroy(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    async reconcileStripeState(): Promise<{
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

        const subscriptions = await this.prisma.subscription.findMany({
            where: {
                paymentProvider: BillingProvider.STRIPE,
                externalSubscriptionId: {
                    not: null,
                },
                status: {
                    in: [
                        SubscriptionStatus.PENDING,
                        SubscriptionStatus.ACTIVE,
                        SubscriptionStatus.PAST_DUE,
                    ],
                },
            },
            orderBy: {
                updatedAt: 'asc',
            },
            take: this.configService.billingReconciliationBatchSize,
            select: {
                externalSubscriptionId: true,
            },
        });

        let processed = 0;
        let failed = 0;

        for (const subscription of subscriptions) {
            if (!subscription.externalSubscriptionId) {
                continue;
            }

            try {
                await this.reconcileSubscription(
                    subscription.externalSubscriptionId,
                );
                processed += 1;
            } catch (error) {
                failed += 1;
                this.logger.warn(
                    `Failed to reconcile subscription ${subscription.externalSubscriptionId}: ${this.describeError(
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
                        name: BillingReconciliationService.LEASE_NAME,
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
                                name: BillingReconciliationService.LEASE_NAME,
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
                        name: BillingReconciliationService.LEASE_NAME,
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
            await this.reconcileStripeState();
        } finally {
            this.isRunning = false;
        }
    }

    private async reconcileSubscription(
        externalSubscriptionId: string,
    ): Promise<void> {
        let subscription: Stripe.Subscription;

        try {
            subscription =
                await this.stripeClientService.client.subscriptions.retrieve(
                    externalSubscriptionId,
                    {
                        expand: ['latest_invoice'],
                    },
                );
        } catch (error) {
            if (this.isStripeNotFound(error)) {
                await this.subscriptionsService.markSubscriptionCanceledByExternalId(
                    externalSubscriptionId,
                );
                return;
            }

            throw error;
        }

        const period = extractStripeSubscriptionPeriod(subscription);
        const subscriptionStatus = this.mapStripeSubscriptionStatus(
            subscription.status,
        );

        await this.subscriptionsService.syncSubscriptionFromExternal({
            externalSubscriptionId: subscription.id,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            status: subscriptionStatus,
            currentPeriodStart: period.currentPeriodStart,
            currentPeriodEnd: period.currentPeriodEnd,
        });

        const latestInvoice = await this.resolveLatestInvoice(
            subscription.latest_invoice,
        );
        if (!latestInvoice) {
            return;
        }

        const invoiceMetadata =
            this.extractInvoiceSubscriptionDetails(latestInvoice)?.metadata ??
            subscription.metadata ??
            null;
        const allowMetadataInvoiceId =
            this.shouldAllowMetadataInvoiceId(latestInvoice);

        await this.subscriptionsService.syncInvoiceFromExternal({
            paymentProvider: 'STRIPE',
            externalInvoiceId: latestInvoice.id,
            externalSubscriptionId: subscription.id,
            metadataInvoiceId: allowMetadataInvoiceId
                ? invoiceMetadata?.invoiceId
                : undefined,
            allowMetadataInvoiceId,
            amountCents: latestInvoice.total,
            currency: latestInvoice.currency.toUpperCase(),
            periodStart: new Date(latestInvoice.period_start * 1000),
            periodEnd: new Date(latestInvoice.period_end * 1000),
            status: this.mapStripeInvoiceStatus(
                latestInvoice,
                subscriptionStatus,
            ),
            attemptCount: latestInvoice.attempt_count ?? 0,
            nextPaymentAttemptAt: latestInvoice.next_payment_attempt
                ? new Date(latestInvoice.next_payment_attempt * 1000)
                : null,
        });
    }

    private async resolveLatestInvoice(
        latestInvoice: string | Stripe.Invoice | null,
    ): Promise<Stripe.Invoice | null> {
        if (!latestInvoice) {
            return null;
        }

        if (typeof latestInvoice !== 'string') {
            return latestInvoice;
        }

        return this.stripeClientService.client.invoices.retrieve(latestInvoice);
    }

    private mapStripeSubscriptionStatus(
        status: Stripe.Subscription.Status,
    ): SubscriptionStatus {
        if (status === 'active' || status === 'trialing') {
            return SubscriptionStatus.ACTIVE;
        }

        if (status === 'canceled') {
            return SubscriptionStatus.CANCELED;
        }

        if (status === 'past_due' || status === 'unpaid') {
            return SubscriptionStatus.PAST_DUE;
        }

        return SubscriptionStatus.PENDING;
    }

    private mapStripeInvoiceStatus(
        invoice: Stripe.Invoice,
        subscriptionStatus: SubscriptionStatus,
    ): InvoiceStatus {
        if (invoice.status === 'paid') {
            return InvoiceStatus.PAID;
        }

        if (
            invoice.status === 'void' ||
            invoice.status === 'uncollectible'
        ) {
            return InvoiceStatus.VOID;
        }

        if (subscriptionStatus === SubscriptionStatus.PAST_DUE) {
            return InvoiceStatus.PAST_DUE;
        }

        return InvoiceStatus.DRAFT;
    }

    private extractInvoiceSubscriptionDetails(
        invoice: Stripe.Invoice,
    ): Stripe.Invoice.Parent.SubscriptionDetails | null {
        return invoice.parent?.subscription_details ?? null;
    }

    private shouldAllowMetadataInvoiceId(invoice: Stripe.Invoice): boolean {
        return (
            invoice.billing_reason === 'subscription' ||
            invoice.billing_reason === 'subscription_create'
        );
    }

    private shouldRun(): boolean {
        return (
            this.configService.paymentProvider === 'STRIPE' &&
            this.configService.billingReconciliationEnabled
        );
    }

    private getLeaseDurationMilliseconds(): number {
        return (
            Math.max(
                this.configService.billingReconciliationIntervalSeconds * 2,
                60,
            ) * 1000
        );
    }

    private isStripeNotFound(error: unknown): boolean {
        const stripeError = error as {
            type?: string;
            code?: string;
        };

        return (
            stripeError?.type === 'StripeInvalidRequestError' &&
            stripeError.code === 'resource_missing'
        );
    }

    private describeError(error: unknown): string {
        if (error instanceof Error && error.message.trim().length > 0) {
            return error.message;
        }

        return 'Unknown reconciliation error';
    }
}
