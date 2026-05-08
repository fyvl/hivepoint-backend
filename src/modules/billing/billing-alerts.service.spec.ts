import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
import { BillingAlertKind } from './dto/billing-alert.dto';
import { BillingAlertsService } from './billing-alerts.service';
import { SubscriptionsService } from './subscriptions.service';

describe('BillingAlertsService', () => {
    let service: BillingAlertsService;
    let prisma: {
        apiVersion: {
            findMany: jest.Mock;
        };
    };
    let subscriptionsService: {
        listUserSubscriptions: jest.Mock;
    };
    let usageService: {
        getSummary: jest.Mock;
    };

    beforeEach(() => {
        prisma = {
            apiVersion: {
                findMany: jest.fn(),
            },
        };
        subscriptionsService = {
            listUserSubscriptions: jest.fn(),
        };
        usageService = {
            getSummary: jest.fn(),
        };

        service = new BillingAlertsService(
            prisma as unknown as PrismaService,
            subscriptionsService as unknown as SubscriptionsService,
            usageService as unknown as UsageService,
        );
    });

    it('emits renewal, payment, quota, and new version alerts', async () => {
        subscriptionsService.listUserSubscriptions.mockResolvedValue({
            items: [
                {
                    id: 'subscription-1',
                    status: 'PAST_DUE',
                    currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
                    currentPeriodEnd: new Date(
                        Date.now() + 3 * 24 * 60 * 60 * 1000,
                    ),
                    gracePeriodEndsAt: new Date('2026-03-25T00:00:00.000Z'),
                    cancelAtPeriodEnd: false,
                    paymentProvider: 'STRIPE',
                    hasExternalSubscription: true,
                    createdAt: new Date('2026-03-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-03-18T00:00:00.000Z'),
                    product: {
                        id: 'product-1',
                        title: 'Payments API',
                    },
                    plan: {
                        id: 'plan-1',
                        name: 'Starter',
                        priceCents: 1900,
                        currency: 'EUR',
                        quotaRequests: 1000,
                        rateLimitRpm: 120,
                        allowOverage: false,
                        overageUnitRequests: null,
                        overagePriceCents: null,
                        productId: 'product-1',
                    },
                    latestInvoice: {
                        id: 'invoice-1',
                        status: 'PAST_DUE',
                        amountCents: 1900,
                        currency: 'EUR',
                        attemptCount: 2,
                        managedRetryCount: 1,
                        managedNextRetryAt: new Date(
                            '2026-03-20T00:00:00.000Z',
                        ),
                        managedLastRetryAt: new Date(
                            '2026-03-19T00:00:00.000Z',
                        ),
                        managedRetryExhaustedAt: null,
                        nextPaymentAttemptAt: new Date(
                            '2026-03-19T00:00:00.000Z',
                        ),
                        createdAt: new Date('2026-03-18T00:00:00.000Z'),
                    },
                    invoices: [],
                },
                {
                    id: 'subscription-2',
                    status: 'ACTIVE',
                    currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
                    currentPeriodEnd: new Date(
                        Date.now() + 2 * 24 * 60 * 60 * 1000,
                    ),
                    gracePeriodEndsAt: null,
                    cancelAtPeriodEnd: false,
                    paymentProvider: 'STRIPE',
                    hasExternalSubscription: true,
                    createdAt: new Date('2026-03-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-03-18T00:00:00.000Z'),
                    product: {
                        id: 'product-2',
                        title: 'Search API',
                    },
                    plan: {
                        id: 'plan-2',
                        name: 'Growth',
                        priceCents: 4900,
                        currency: 'EUR',
                        quotaRequests: 5000,
                        rateLimitRpm: 240,
                        allowOverage: false,
                        overageUnitRequests: null,
                        overagePriceCents: null,
                        productId: 'product-2',
                    },
                    latestInvoice: null,
                    invoices: [],
                },
            ],
        });
        usageService.getSummary.mockResolvedValue({
            items: [
                {
                    subscriptionId: 'subscription-2',
                    status: 'ACTIVE',
                    periodStart: new Date('2026-03-01T00:00:00.000Z'),
                    periodEnd: new Date('2026-03-31T00:00:00.000Z'),
                    gracePeriodEndsAt: null,
                    usedRequests: 4200,
                    quotaRequests: 5000,
                    percent: 84,
                    overageEnabled: false,
                    overageUnitRequests: null,
                    overagePriceCents: null,
                    overageRequests: 0,
                    projectedOverageAmountCents: 0,
                    plan: {
                        id: 'plan-2',
                        name: 'Growth',
                        quotaRequests: 5000,
                        rateLimitRpm: 240,
                        allowOverage: false,
                        overageUnitRequests: null,
                        overagePriceCents: null,
                    },
                    product: {
                        id: 'product-2',
                        title: 'Search API',
                    },
                },
            ],
        });
        prisma.apiVersion.findMany.mockResolvedValue([
            {
                id: 'version-2',
                productId: 'product-2',
                version: 'v2',
                createdAt: new Date('2026-03-15T00:00:00.000Z'),
            },
        ]);

        const result = await service.listAlerts({
            id: 'buyer-1',
            email: 'buyer@example.com',
            role: 'BUYER',
        });

        expect(result.items.map((item) => item.kind)).toEqual(
            expect.arrayContaining([
                BillingAlertKind.PAYMENT_PAST_DUE,
                BillingAlertKind.PAYMENT_RETRY_SCHEDULED,
                BillingAlertKind.UPCOMING_RENEWAL,
                BillingAlertKind.QUOTA_NEAR_LIMIT,
                BillingAlertKind.NEW_VERSION_AVAILABLE,
            ]),
        );
        expect(
            result.items.find(
                (item) =>
                    item.kind === BillingAlertKind.PAYMENT_RETRY_SCHEDULED,
            )?.message,
        ).toContain('Hivepoint will retry');
    });

    it('emits overage alert instead of quota exceeded for overage-enabled plans', async () => {
        subscriptionsService.listUserSubscriptions.mockResolvedValue({
            items: [
                {
                    id: 'subscription-2',
                    status: 'ACTIVE',
                    currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
                    currentPeriodEnd: new Date('2026-03-31T00:00:00.000Z'),
                    gracePeriodEndsAt: null,
                    cancelAtPeriodEnd: false,
                    paymentProvider: 'STRIPE',
                    hasExternalSubscription: true,
                    createdAt: new Date('2026-03-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-03-18T00:00:00.000Z'),
                    product: {
                        id: 'product-2',
                        title: 'Search API',
                    },
                    plan: {
                        id: 'plan-2',
                        name: 'Growth',
                        priceCents: 4900,
                        currency: 'EUR',
                        quotaRequests: 5000,
                        rateLimitRpm: 240,
                        allowOverage: true,
                        overageUnitRequests: 1000,
                        overagePriceCents: 250,
                        productId: 'product-2',
                    },
                    latestInvoice: null,
                    invoices: [],
                },
            ],
        });
        usageService.getSummary.mockResolvedValue({
            items: [
                {
                    subscriptionId: 'subscription-2',
                    status: 'ACTIVE',
                    periodStart: new Date('2026-03-01T00:00:00.000Z'),
                    periodEnd: new Date('2026-03-31T00:00:00.000Z'),
                    gracePeriodEndsAt: null,
                    usedRequests: 6200,
                    quotaRequests: 5000,
                    percent: 100,
                    overageEnabled: true,
                    overageUnitRequests: 1000,
                    overagePriceCents: 250,
                    overageRequests: 1200,
                    projectedOverageAmountCents: 500,
                    plan: {
                        id: 'plan-2',
                        name: 'Growth',
                        quotaRequests: 5000,
                        rateLimitRpm: 240,
                        allowOverage: true,
                        overageUnitRequests: 1000,
                        overagePriceCents: 250,
                    },
                    product: {
                        id: 'product-2',
                        title: 'Search API',
                    },
                },
            ],
        });
        prisma.apiVersion.findMany.mockResolvedValue([]);

        const result = await service.listAlerts({
            id: 'buyer-1',
            email: 'buyer@example.com',
            role: 'BUYER',
        });

        expect(result.items.map((item) => item.kind)).toEqual([
            BillingAlertKind.OVERAGE_ACTIVE,
        ]);
        expect(result.items[0]?.message).toContain(
            'Projected overage charges are 500 cents',
        );
    });
});
