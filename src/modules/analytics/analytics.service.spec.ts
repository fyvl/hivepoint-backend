import {
    ProductStatus,
    SubscriptionStatus,
    VersionStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

type PrismaMock = {
    apiProduct: {
        findMany: jest.Mock;
    };
    productView: {
        groupBy: jest.Mock;
    };
    subscription: {
        findMany: jest.Mock;
    };
    invoice: {
        findMany: jest.Mock;
    };
    usageRecord: {
        findMany: jest.Mock;
    };
};

describe('AnalyticsService', () => {
    let service: AnalyticsService;
    let prisma: PrismaMock;

    beforeEach(() => {
        prisma = {
            apiProduct: {
                findMany: jest.fn(),
            },
            productView: {
                groupBy: jest.fn(),
            },
            subscription: {
                findMany: jest.fn(),
            },
            invoice: {
                findMany: jest.fn(),
            },
            usageRecord: {
                findMany: jest.fn(),
            },
        };

        service = new AnalyticsService(prisma as unknown as PrismaService);
    });

    it('aggregates seller analytics from views, subscriptions, invoices, and usage', async () => {
        prisma.apiProduct.findMany.mockResolvedValue([
            {
                id: 'product-1',
                title: 'Payments API',
                status: ProductStatus.PUBLISHED,
                plans: [{ id: 'plan-1' }],
                versions: [
                    {
                        id: 'version-2',
                        version: 'v2',
                        createdAt: new Date('2026-03-10T00:00:00.000Z'),
                        status: VersionStatus.PUBLISHED,
                    },
                ],
            },
        ]);
        prisma.productView.groupBy.mockResolvedValue([
            {
                productId: 'product-1',
                _count: {
                    _all: 20,
                },
            },
        ]);
        prisma.subscription.findMany.mockResolvedValue([
            {
                id: 'subscription-1',
                userId: 'buyer-1',
                status: SubscriptionStatus.ACTIVE,
                createdAt: new Date(),
                planId: 'plan-1',
                plan: {
                    priceCents: 1900,
                },
            },
            {
                id: 'subscription-2',
                userId: 'buyer-2',
                status: SubscriptionStatus.PAST_DUE,
                createdAt: new Date(),
                planId: 'plan-1',
                plan: {
                    priceCents: 1900,
                },
            },
        ]);
        prisma.invoice.findMany.mockResolvedValue([
            {
                subscription: {
                    planId: 'plan-1',
                },
            },
        ]);
        prisma.usageRecord.findMany.mockResolvedValue([
            {
                endpoint: '/v1/health',
                requestCount: 12,
                subscription: {
                    planId: 'plan-1',
                },
            },
            {
                endpoint: '/v1/search',
                requestCount: 40,
                subscription: {
                    planId: 'plan-1',
                },
            },
        ]);

        const result = await service.getSellerOverview({
            id: 'seller-1',
            email: 'seller@example.com',
            role: 'SELLER',
        });

        expect(result.totals.productCount).toBe(1);
        expect(result.totals.publishedProductCount).toBe(1);
        expect(result.totals.views30d).toBe(20);
        expect(result.totals.subscriptions30d).toBe(2);
        expect(result.totals.activeClients).toBe(2);
        expect(result.totals.pastDueClients).toBe(1);
        expect(result.totals.failedPayments30d).toBe(1);
        expect(result.totals.requests30d).toBe(52);
        expect(result.totals.mrrCents).toBe(1900);
        expect(result.products[0]).toEqual(
            expect.objectContaining({
                productId: 'product-1',
                conversionRate30d: 10,
                failedPayments30d: 1,
                requests30d: 52,
                latestPublishedVersion: expect.objectContaining({
                    id: 'version-2',
                    version: 'v2',
                }),
                topEndpoints: [
                    { endpoint: '/v1/search', requestCount: 40 },
                    { endpoint: '/v1/health', requestCount: 12 },
                ],
            }),
        );
    });
});
