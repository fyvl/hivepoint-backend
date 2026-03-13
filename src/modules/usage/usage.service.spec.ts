import { Role, SubscriptionStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env.schema';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageService } from './usage.service';

type PrismaMock = {
    apiKey: {
        findFirst: jest.Mock;
    };
    apiProduct: {
        findUnique: jest.Mock;
    };
    subscription: {
        findUnique: jest.Mock;
        findMany: jest.Mock;
        findFirst: jest.Mock;
    };
    usageRecord: {
        aggregate: jest.Mock;
        create: jest.Mock;
        groupBy: jest.Mock;
    };
};

describe('UsageService', () => {
    let service: UsageService;
    let prisma: PrismaMock;
    let configService: ConfigService<Env, true>;

    beforeEach(() => {
        prisma = {
            apiKey: {
                findFirst: jest.fn(),
            },
            apiProduct: {
                findUnique: jest.fn(),
            },
            subscription: {
                findUnique: jest.fn(),
                findMany: jest.fn(),
                findFirst: jest.fn(),
            },
            usageRecord: {
                aggregate: jest.fn(),
                create: jest.fn(),
                groupBy: jest.fn(),
            },
        };

        configService = {
            getOrThrow: jest.fn((key: keyof Env) => {
                if (key === 'USAGE_INGEST_SECRET') {
                    return 'secret';
                }

                if (key === 'API_KEY_SALT') {
                    return 'salt';
                }

                return 'secret';
            }),
        } as unknown as ConfigService<Env, true>;

        service = new UsageService(
            prisma as unknown as PrismaService,
            configService,
        );
    });

    it('returns not allowed when api key is invalid', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Payments API',
        });
        prisma.apiKey.findFirst.mockResolvedValue(null);

        const result = await service.authorizeUsage(
            {
                apiKey: 'hp_invalid',
                productId: 'prod-1',
                endpoint: '/v1/search',
                requestCount: 1,
            },
            'secret',
        );

        expect(result).toEqual({
            allowed: false,
            reason: 'INVALID_API_KEY',
            product: {
                id: 'prod-1',
                title: 'Payments API',
            },
            requestedRequests: 1,
            usageRecorded: false,
        });
    });

    it('authorizes usage and can consume quota in one call', async () => {
        const periodStart = new Date('2026-01-01T00:00:00.000Z');
        const periodEnd = new Date('2026-02-01T00:00:00.000Z');

        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Payments API',
        });
        prisma.apiKey.findFirst.mockResolvedValue({
            id: 'key-1',
            userId: 'user-1',
        });
        prisma.subscription.findFirst.mockResolvedValue({
            id: 'sub-1',
            userId: 'user-1',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 1000,
                product: {
                    id: 'prod-1',
                    title: 'Payments API',
                },
            },
        });
        prisma.subscription.findUnique.mockResolvedValue({
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
        });
        prisma.usageRecord.aggregate.mockResolvedValue({
            _sum: {
                requestCount: 120,
            },
        });
        prisma.usageRecord.create.mockResolvedValue({});

        const result = await service.authorizeUsage(
            {
                apiKey: 'hp_valid',
                productId: 'prod-1',
                endpoint: '/v1/search',
                requestCount: 2,
                occurredAt: '2026-01-25T10:00:00.000Z',
                consume: true,
            },
            'secret',
        );

        expect(prisma.usageRecord.create).toHaveBeenCalledWith({
            data: {
                subscriptionId: 'sub-1',
                occurredAt: new Date('2026-01-25T10:00:00.000Z'),
                endpoint: '/v1/search',
                requestCount: 2,
            },
        });
        expect(result).toEqual({
            allowed: true,
            apiKeyId: 'key-1',
            subscriptionId: 'sub-1',
            userId: 'user-1',
            periodStart,
            periodEnd,
            usedRequests: 122,
            requestedRequests: 2,
            quotaRequests: 1000,
            remainingRequests: 878,
            usageRecorded: true,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 1000,
            },
            product: {
                id: 'prod-1',
                title: 'Payments API',
            },
        });
    });

    it('authorizes gateway usage without requiring the ingest secret', async () => {
        const periodStart = new Date('2026-01-01T00:00:00.000Z');
        const periodEnd = new Date('2026-02-01T00:00:00.000Z');

        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Payments API',
        });
        prisma.apiKey.findFirst.mockResolvedValue({
            id: 'key-1',
            userId: 'user-1',
        });
        prisma.subscription.findFirst.mockResolvedValue({
            id: 'sub-1',
            userId: 'user-1',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 1000,
                product: {
                    id: 'prod-1',
                    title: 'Payments API',
                },
            },
        });
        prisma.usageRecord.aggregate.mockResolvedValue({
            _sum: {
                requestCount: 50,
            },
        });

        const result = await service.authorizeGatewayUsage({
            apiKey: 'hp_valid',
            productId: 'prod-1',
            endpoint: '/v1/search',
            requestCount: 1,
        });

        expect(result).toMatchObject({
            allowed: true,
            subscriptionId: 'sub-1',
            remainingRequests: 950,
            usageRecorded: false,
        });
    });

    it('returns quota exceeded when request would exceed plan quota', async () => {
        const periodStart = new Date('2026-01-01T00:00:00.000Z');
        const periodEnd = new Date('2026-02-01T00:00:00.000Z');

        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Payments API',
        });
        prisma.apiKey.findFirst.mockResolvedValue({
            id: 'key-1',
            userId: 'user-1',
        });
        prisma.subscription.findFirst.mockResolvedValue({
            id: 'sub-1',
            userId: 'user-1',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 100,
                product: {
                    id: 'prod-1',
                    title: 'Payments API',
                },
            },
        });
        prisma.usageRecord.aggregate.mockResolvedValue({
            _sum: {
                requestCount: 99,
            },
        });

        const result = await service.authorizeUsage(
            {
                apiKey: 'hp_valid',
                productId: 'prod-1',
                endpoint: '/v1/search',
                requestCount: 2,
            },
            'secret',
        );

        expect(prisma.usageRecord.create).not.toHaveBeenCalled();
        expect(result).toEqual({
            allowed: false,
            reason: 'QUOTA_EXCEEDED',
            apiKeyId: 'key-1',
            subscriptionId: 'sub-1',
            userId: 'user-1',
            periodStart,
            periodEnd,
            usedRequests: 99,
            requestedRequests: 2,
            quotaRequests: 100,
            remainingRequests: 1,
            usageRecorded: false,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 100,
            },
            product: {
                id: 'prod-1',
                title: 'Payments API',
            },
        });
    });

    it('rejects ingest with wrong secret', async () => {
        await expect(
            service.ingestUsage(
                {
                    subscriptionId: 'sub-1',
                    endpoint: '/v1/search',
                    requestCount: 1,
                },
                'wrong',
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.USAGE_INGEST_FORBIDDEN,
        });
    });

    it('rejects ingest when subscription is missing', async () => {
        prisma.subscription.findUnique.mockResolvedValue(null);

        await expect(
            service.ingestUsage(
                {
                    subscriptionId: 'sub-1',
                    endpoint: '/v1/search',
                    requestCount: 1,
                },
                'secret',
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.SUBSCRIPTION_NOT_FOUND,
        });
    });

    it('creates usage record on success', async () => {
        const occurredAt = '2026-01-25T10:00:00.000Z';
        prisma.subscription.findUnique.mockResolvedValue({
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
        });
        prisma.usageRecord.create.mockResolvedValue({});

        const result = await service.ingestUsage(
            {
                subscriptionId: 'sub-1',
                endpoint: '/v1/search',
                requestCount: 2,
                occurredAt,
            },
            'secret',
        );

        expect(prisma.usageRecord.create).toHaveBeenCalledWith({
            data: {
                subscriptionId: 'sub-1',
                occurredAt: new Date(occurredAt),
                endpoint: '/v1/search',
                requestCount: 2,
            },
        });
        expect(result).toEqual({ ok: true });
    });

    it('summarizes usage for active subscriptions', async () => {
        const periodStart = new Date('2026-01-01T00:00:00.000Z');
        const periodEnd = new Date('2026-02-01T00:00:00.000Z');

        prisma.subscription.findMany.mockResolvedValue([
            {
                id: 'sub-1',
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                plan: {
                    id: 'plan-1',
                    name: 'Starter',
                    quotaRequests: 1000,
                    product: {
                        id: 'prod-1',
                        title: 'Payments API',
                    },
                },
            },
            {
                id: 'sub-2',
                currentPeriodStart: null,
                currentPeriodEnd: null,
                plan: {
                    id: 'plan-2',
                    name: 'Pro',
                    quotaRequests: 2000,
                    product: {
                        id: 'prod-2',
                        title: 'Search API',
                    },
                },
            },
        ]);
        prisma.usageRecord.groupBy.mockResolvedValue([
            {
                subscriptionId: 'sub-1',
                _sum: {
                    requestCount: 120,
                },
            },
        ]);

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        const result = await service.getSummary(user);

        expect(prisma.subscription.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    userId: 'user-1',
                    status: SubscriptionStatus.ACTIVE,
                },
            }),
        );
        expect(result.items).toEqual([
            {
                subscriptionId: 'sub-1',
                periodStart,
                periodEnd,
                usedRequests: 120,
                quotaRequests: 1000,
                percent: 12,
                plan: {
                    id: 'plan-1',
                    name: 'Starter',
                    quotaRequests: 1000,
                },
                product: {
                    id: 'prod-1',
                    title: 'Payments API',
                },
            },
        ]);
    });
});
