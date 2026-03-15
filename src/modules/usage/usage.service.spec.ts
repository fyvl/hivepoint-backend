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
    $transaction: jest.Mock;
};

describe('UsageService', () => {
    let service: UsageService;
    let prisma: PrismaMock;
    let configService: ConfigService<Env, true>;
    let txExecuteRaw: jest.Mock;

    beforeEach(() => {
        txExecuteRaw = jest.fn();
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
            $transaction: jest.fn(async (callback) =>
                callback({
                    ...prisma,
                    $executeRaw: txExecuteRaw,
                }),
            ),
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
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            gracePeriodEndsAt: null,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 1000,
                rateLimitRpm: null,
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
        expect(txExecuteRaw).toHaveBeenCalled();
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
            rateLimitRpm: null,
            remainingRateLimitRequests: null,
            usageRecorded: true,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 1000,
                rateLimitRpm: null,
            },
            product: {
                id: 'prod-1',
                title: 'Payments API',
            },
        });
    });

    it('authorizes gateway usage without requiring the ingest secret', async () => {
        const periodStart = new Date('2099-01-01T00:00:00.000Z');
        const periodEnd = new Date('2099-02-01T00:00:00.000Z');

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
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            gracePeriodEndsAt: null,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 1000,
                rateLimitRpm: null,
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
            occurredAt: '2099-01-25T10:00:00.000Z',
        });

        expect(result).toMatchObject({
            allowed: true,
            subscriptionId: 'sub-1',
            remainingRequests: 950,
            rateLimitRpm: null,
            remainingRateLimitRequests: null,
            usageRecorded: false,
        });
    });

    it('returns quota exceeded when request would exceed plan quota', async () => {
        const periodStart = new Date('2099-01-01T00:00:00.000Z');
        const periodEnd = new Date('2099-02-01T00:00:00.000Z');

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
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            gracePeriodEndsAt: null,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 100,
                rateLimitRpm: null,
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
                occurredAt: '2099-01-25T10:00:00.000Z',
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
            rateLimitRpm: null,
            remainingRateLimitRequests: null,
            usageRecorded: false,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 100,
                rateLimitRpm: null,
            },
            product: {
                id: 'prod-1',
                title: 'Payments API',
            },
        });
    });

    it('returns rate limit exceeded when gateway traffic exceeds plan rpm', async () => {
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
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            gracePeriodEndsAt: null,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 1000,
                rateLimitRpm: 60,
                product: {
                    id: 'prod-1',
                    title: 'Payments API',
                },
            },
        });
        prisma.usageRecord.aggregate
            .mockResolvedValueOnce({
                _sum: {
                    requestCount: 100,
                },
            })
            .mockResolvedValueOnce({
                _sum: {
                    requestCount: 60,
                },
            });

        const result = await service.authorizeGatewayUsage({
            apiKey: 'hp_valid',
            productId: 'prod-1',
            endpoint: '/v1/search',
            requestCount: 1,
            occurredAt: '2026-01-25T10:00:00.000Z',
            consume: true,
        });

        expect(prisma.usageRecord.create).not.toHaveBeenCalled();
        expect(result).toEqual({
            allowed: false,
            reason: 'RATE_LIMIT_EXCEEDED',
            apiKeyId: 'key-1',
            subscriptionId: 'sub-1',
            userId: 'user-1',
            periodStart,
            periodEnd,
            usedRequests: 100,
            requestedRequests: 1,
            quotaRequests: 1000,
            remainingRequests: 900,
            rateLimitRpm: 60,
            remainingRateLimitRequests: 0,
            usageRecorded: false,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 1000,
                rateLimitRpm: 60,
            },
            product: {
                id: 'prod-1',
                title: 'Payments API',
            },
        });
    });

    it('authorizes past due subscriptions during an active grace period', async () => {
        const periodStart = new Date('2026-01-01T00:00:00.000Z');
        const periodEnd = new Date('2026-02-01T00:00:00.000Z');
        const gracePeriodEndsAt = new Date('2026-02-04T00:00:00.000Z');

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
            status: SubscriptionStatus.PAST_DUE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            gracePeriodEndsAt,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 1000,
                rateLimitRpm: null,
                product: {
                    id: 'prod-1',
                    title: 'Payments API',
                },
            },
        });
        prisma.usageRecord.aggregate.mockResolvedValue({
            _sum: {
                requestCount: 200,
            },
        });

        const result = await service.authorizeGatewayUsage({
            apiKey: 'hp_valid',
            productId: 'prod-1',
            endpoint: '/v1/search',
            requestCount: 1,
            occurredAt: '2026-02-02T10:00:00.000Z',
        });

        expect(result).toEqual({
            allowed: true,
            apiKeyId: 'key-1',
            subscriptionId: 'sub-1',
            userId: 'user-1',
            periodStart,
            periodEnd: gracePeriodEndsAt,
            usedRequests: 200,
            requestedRequests: 1,
            quotaRequests: 1000,
            remainingRequests: 800,
            rateLimitRpm: null,
            remainingRateLimitRequests: null,
            usageRecorded: false,
            plan: {
                id: 'plan-1',
                name: 'Starter',
                quotaRequests: 1000,
                rateLimitRpm: null,
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
        const periodStart = new Date('2026-01-01T00:00:00.000Z');
        const periodEnd = new Date('2026-02-01T00:00:00.000Z');

        prisma.subscription.findUnique.mockResolvedValue({
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            gracePeriodEndsAt: null,
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
        jest.useFakeTimers().setSystemTime(
            new Date('2026-03-15T12:00:00.000Z'),
        );

        const periodStart = new Date('2026-03-01T00:00:00.000Z');
        const periodEnd = new Date('2026-04-01T00:00:00.000Z');

        prisma.subscription.findMany.mockResolvedValue([
            {
                id: 'sub-1',
                status: SubscriptionStatus.ACTIVE,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                gracePeriodEndsAt: null,
                plan: {
                    id: 'plan-1',
                    name: 'Starter',
                    quotaRequests: 1000,
                    rateLimitRpm: 120,
                    product: {
                        id: 'prod-1',
                        title: 'Payments API',
                    },
                },
            },
            {
                id: 'sub-2',
                status: SubscriptionStatus.ACTIVE,
                currentPeriodStart: null,
                currentPeriodEnd: null,
                gracePeriodEndsAt: null,
                plan: {
                    id: 'plan-2',
                    name: 'Pro',
                    quotaRequests: 2000,
                    rateLimitRpm: null,
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

        try {
            const result = await service.getSummary(user);

            expect(prisma.subscription.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId: 'user-1',
                        status: {
                            in: [
                                SubscriptionStatus.ACTIVE,
                                SubscriptionStatus.PAST_DUE,
                            ],
                        },
                    },
                }),
            );
            expect(result.items).toEqual([
                {
                    subscriptionId: 'sub-1',
                    status: SubscriptionStatus.ACTIVE,
                    periodStart,
                    periodEnd,
                    gracePeriodEndsAt: null,
                    usedRequests: 120,
                    quotaRequests: 1000,
                    percent: 12,
                    plan: {
                        id: 'plan-1',
                        name: 'Starter',
                        quotaRequests: 1000,
                        rateLimitRpm: 120,
                    },
                    product: {
                        id: 'prod-1',
                        title: 'Payments API',
                    },
                },
            ]);
        } finally {
            jest.useRealTimers();
        }
    });

    it('summarizes past due subscriptions while grace period is active', async () => {
        jest.useFakeTimers().setSystemTime(
            new Date('2026-03-15T12:00:00.000Z'),
        );

        const periodStart = new Date('2026-03-01T00:00:00.000Z');
        const gracePeriodEndsAt = new Date('2026-03-18T00:00:00.000Z');

        prisma.subscription.findMany.mockResolvedValue([
            {
                id: 'sub-1',
                status: SubscriptionStatus.PAST_DUE,
                currentPeriodStart: periodStart,
                currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
                gracePeriodEndsAt,
                plan: {
                    id: 'plan-1',
                    name: 'Starter',
                    quotaRequests: 1000,
                    rateLimitRpm: 120,
                    product: {
                        id: 'prod-1',
                        title: 'Payments API',
                    },
                },
            },
        ]);
        prisma.usageRecord.groupBy.mockResolvedValue([
            {
                subscriptionId: 'sub-1',
                _sum: {
                    requestCount: 320,
                },
            },
        ]);

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        try {
            const result = await service.getSummary(user);

            expect(result.items).toEqual([
                {
                    subscriptionId: 'sub-1',
                    status: SubscriptionStatus.PAST_DUE,
                    periodStart,
                    periodEnd: gracePeriodEndsAt,
                    gracePeriodEndsAt,
                    usedRequests: 320,
                    quotaRequests: 1000,
                    percent: 32,
                    plan: {
                        id: 'plan-1',
                        name: 'Starter',
                        quotaRequests: 1000,
                        rateLimitRpm: 120,
                    },
                    product: {
                        id: 'prod-1',
                        title: 'Payments API',
                    },
                },
            ]);
        } finally {
            jest.useRealTimers();
        }
    });
});
