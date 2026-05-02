import {
    BillingProvider,
    InvoiceKind,
    InvoiceStatus,
    PlanPeriod,
    SubscriptionStatus,
} from '@prisma/client';
import { AppConfigService } from '../../common/config/config.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageAggregationService } from '../usage/usage-aggregation.service';
import { BillingOverageCollectionService } from './billing-overage-collection.service';
import { StripePaymentProvider } from './payment/stripe-payment.provider';
import { SubscriptionsService } from './subscriptions.service';

describe('BillingOverageCollectionService', () => {
    let service: BillingOverageCollectionService;
    let prisma: {
        backgroundJobLease: {
            findUnique: jest.Mock;
            create: jest.Mock;
            updateMany: jest.Mock;
        };
        invoice: {
            findMany: jest.Mock;
            findUnique: jest.Mock;
            create: jest.Mock;
            update: jest.Mock;
        };
        subscription: {
            update: jest.Mock;
        };
        $transaction: jest.Mock;
    };
    let configService: Pick<
        AppConfigService,
        | 'paymentProvider'
        | 'billingOverageCollectionEnabled'
        | 'billingOverageCollectionIntervalSeconds'
        | 'billingOverageCollectionBatchSize'
    >;
    let usageAggregationService: {
        sumUsageForWindow: jest.Mock;
    };
    let stripePaymentProvider: {
        createManagedInvoice: jest.Mock;
    };
    let subscriptionsService: {
        markInvoicePaid: jest.Mock;
        markInvoiceFailed: jest.Mock;
    };

    beforeEach(() => {
        prisma = {
            backgroundJobLease: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({}),
                updateMany: jest.fn(),
            },
            invoice: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn().mockResolvedValue({}),
                update: jest.fn().mockResolvedValue({}),
            },
            subscription: {
                update: jest.fn().mockResolvedValue({}),
            },
            $transaction: jest.fn(async (callback) =>
                callback({
                    ...prisma,
                }),
            ),
        };
        configService = {
            paymentProvider: 'STRIPE',
            billingOverageCollectionEnabled: true,
            billingOverageCollectionIntervalSeconds: 300,
            billingOverageCollectionBatchSize: 25,
        };
        usageAggregationService = {
            sumUsageForWindow: jest.fn(),
        };
        stripePaymentProvider = {
            createManagedInvoice: jest.fn(),
        };
        subscriptionsService = {
            markInvoicePaid: jest.fn().mockResolvedValue({ ok: true }),
            markInvoiceFailed: jest.fn().mockResolvedValue({ ok: true }),
        };

        service = new BillingOverageCollectionService(
            prisma as unknown as PrismaService,
            configService as AppConfigService,
            usageAggregationService as unknown as UsageAggregationService,
            stripePaymentProvider as unknown as StripePaymentProvider,
            subscriptionsService as unknown as SubscriptionsService,
        );
    });

    it('materializes overage invoices and rolls local pay-per-use periods forward', async () => {
        const periodStart = new Date('2026-04-01T00:00:00.000Z');
        const periodEnd = new Date('2026-05-01T00:00:00.000Z');

        prisma.invoice.findMany
            .mockResolvedValueOnce([{ id: 'inv-source-1' }])
            .mockResolvedValueOnce([{ id: 'inv-overage-1' }]);
        prisma.invoice.findUnique
            .mockResolvedValueOnce({
                id: 'inv-source-1',
                kind: InvoiceKind.SUBSCRIPTION,
                status: InvoiceStatus.PAID,
                paymentProvider: BillingProvider.STRIPE,
                currency: 'EUR',
                periodStart,
                periodEnd,
                overageProcessedAt: null,
                derivedOverageInvoice: null,
                subscription: {
                    id: 'sub-1',
                    status: SubscriptionStatus.ACTIVE,
                    paymentProvider: BillingProvider.STRIPE,
                    externalSubscriptionId: null,
                    currentPeriodEnd: periodEnd,
                    cancelAtPeriodEnd: false,
                    user: {
                        id: 'user-1',
                        email: 'user@example.com',
                    },
                    plan: {
                        name: 'PayGo',
                        priceCents: 0,
                        currency: 'EUR',
                        period: PlanPeriod.MONTH,
                        quotaRequests: 1_000,
                        allowOverage: true,
                        overageUnitRequests: 500,
                        overagePriceCents: 200,
                        product: {
                            title: 'Payments API',
                        },
                    },
                },
            })
            .mockResolvedValueOnce({
                id: 'inv-overage-1',
                kind: InvoiceKind.OVERAGE,
                status: InvoiceStatus.DRAFT,
                externalInvoiceId: null,
                amountCents: 400,
                currency: 'EUR',
                periodStart,
                periodEnd,
                overageRequests: 600,
                overageUnits: 2,
                subscription: {
                    externalSubscriptionId: null,
                    user: {
                        id: 'user-1',
                        email: 'user@example.com',
                    },
                    plan: {
                        name: 'PayGo',
                        product: {
                            title: 'Payments API',
                        },
                    },
                },
            });
        usageAggregationService.sumUsageForWindow.mockResolvedValue(1_600);
        stripePaymentProvider.createManagedInvoice.mockResolvedValue({
            externalInvoiceId: 'in_overage_1',
            externalSubscriptionId: undefined,
            amountCents: 400,
            currency: 'EUR',
            periodStart,
            periodEnd,
            status: 'PAID',
            attemptCount: 1,
            nextPaymentAttemptAt: null,
        });

        const result = await service.processDueOverageCollection();

        expect(prisma.invoice.create).toHaveBeenNthCalledWith(1, {
            data: {
                subscriptionId: 'sub-1',
                paymentProvider: BillingProvider.STRIPE,
                kind: InvoiceKind.OVERAGE,
                overageSourceInvoiceId: 'inv-source-1',
                overageRequests: 600,
                overageUnits: 2,
                amountCents: 400,
                currency: 'EUR',
                status: InvoiceStatus.DRAFT,
                periodStart,
                periodEnd,
            },
        });
        expect(prisma.invoice.create).toHaveBeenNthCalledWith(2, {
            data: {
                subscriptionId: 'sub-1',
                paymentProvider: BillingProvider.STRIPE,
                kind: InvoiceKind.SUBSCRIPTION,
                amountCents: 0,
                currency: 'EUR',
                status: InvoiceStatus.PAID,
                periodStart: periodEnd,
                periodEnd: new Date('2026-06-01T00:00:00.000Z'),
            },
        });
        expect(prisma.subscription.update).toHaveBeenCalledWith({
            where: {
                id: 'sub-1',
            },
            data: {
                status: SubscriptionStatus.ACTIVE,
                currentPeriodStart: periodEnd,
                currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
                gracePeriodEndsAt: null,
            },
        });
        expect(prisma.invoice.update).toHaveBeenCalledWith({
            where: {
                id: 'inv-source-1',
            },
            data: {
                overageProcessedAt: expect.any(Date),
            },
        });
        expect(subscriptionsService.markInvoicePaid).toHaveBeenCalledWith({
            invoiceId: 'inv-overage-1',
            paymentProvider: 'STRIPE',
            externalInvoiceId: 'in_overage_1',
            externalSubscriptionId: undefined,
            attemptCount: 1,
        });
        expect(result).toEqual({
            materialized: 1,
            collected: 1,
            failed: 0,
        });
    });

    it('cancels local pay-per-use subscriptions at period end without rolling them forward', async () => {
        const periodStart = new Date('2026-04-01T00:00:00.000Z');
        const periodEnd = new Date('2026-05-01T00:00:00.000Z');

        prisma.invoice.findMany
            .mockResolvedValueOnce([{ id: 'inv-source-1' }])
            .mockResolvedValueOnce([]);
        prisma.invoice.findUnique.mockResolvedValue({
            id: 'inv-source-1',
            kind: InvoiceKind.SUBSCRIPTION,
            status: InvoiceStatus.PAID,
            paymentProvider: BillingProvider.STRIPE,
            currency: 'EUR',
            periodStart,
            periodEnd,
            overageProcessedAt: null,
            derivedOverageInvoice: null,
            subscription: {
                id: 'sub-1',
                status: SubscriptionStatus.ACTIVE,
                paymentProvider: BillingProvider.STRIPE,
                externalSubscriptionId: null,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: true,
                user: {
                    id: 'user-1',
                    email: 'user@example.com',
                },
                plan: {
                    name: 'PayGo',
                    priceCents: 0,
                    currency: 'EUR',
                    period: PlanPeriod.MONTH,
                    quotaRequests: 1_000,
                    allowOverage: true,
                    overageUnitRequests: 500,
                    overagePriceCents: 200,
                    product: {
                        title: 'Payments API',
                    },
                },
            },
        });
        usageAggregationService.sumUsageForWindow.mockResolvedValue(1_000);

        const result = await service.processDueOverageCollection();

        expect(prisma.invoice.create).not.toHaveBeenCalled();
        expect(prisma.subscription.update).toHaveBeenCalledWith({
            where: {
                id: 'sub-1',
            },
            data: {
                status: SubscriptionStatus.CANCELED,
                cancelAtPeriodEnd: false,
                gracePeriodEndsAt: null,
            },
        });
        expect(result).toEqual({
            materialized: 1,
            collected: 0,
            failed: 0,
        });
    });

    it('marks collected overage invoices as past due when Stripe cannot charge them', async () => {
        const periodStart = new Date('2026-04-01T00:00:00.000Z');
        const periodEnd = new Date('2026-05-01T00:00:00.000Z');
        const nextPaymentAttemptAt = new Date('2026-05-02T10:00:00.000Z');

        prisma.invoice.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'inv-overage-1' }]);
        prisma.invoice.findUnique.mockResolvedValue({
            id: 'inv-overage-1',
            kind: InvoiceKind.OVERAGE,
            status: InvoiceStatus.DRAFT,
            externalInvoiceId: null,
            amountCents: 400,
            currency: 'EUR',
            periodStart,
            periodEnd,
            overageRequests: 600,
            overageUnits: 2,
            subscription: {
                externalSubscriptionId: 'sub_ext_1',
                user: {
                    id: 'user-1',
                    email: 'user@example.com',
                },
                plan: {
                    name: 'PayGo',
                    product: {
                        title: 'Payments API',
                    },
                },
            },
        });
        stripePaymentProvider.createManagedInvoice.mockResolvedValue({
            externalInvoiceId: 'in_overage_1',
            externalSubscriptionId: 'sub_ext_1',
            amountCents: 400,
            currency: 'EUR',
            periodStart,
            periodEnd,
            status: 'PAST_DUE',
            attemptCount: 1,
            nextPaymentAttemptAt,
        });

        const result = await service.processDueOverageCollection();

        expect(subscriptionsService.markInvoiceFailed).toHaveBeenCalledWith({
            invoiceId: 'inv-overage-1',
            paymentProvider: 'STRIPE',
            externalInvoiceId: 'in_overage_1',
            externalSubscriptionId: 'sub_ext_1',
            invoiceStatus: InvoiceStatus.PAST_DUE,
            attemptCount: 1,
            nextPaymentAttemptAt,
        });
        expect(result).toEqual({
            materialized: 0,
            collected: 1,
            failed: 0,
        });
    });

    it('treats retryable lease transaction conflicts as a skipped cycle', async () => {
        prisma.$transaction.mockRejectedValue({
            code: 'P2034',
        });

        const result = await service.processDueOverageCollection();

        expect(prisma.invoice.findMany).not.toHaveBeenCalled();
        expect(result).toEqual({
            materialized: 0,
            collected: 0,
            failed: 0,
        });
    });
});
