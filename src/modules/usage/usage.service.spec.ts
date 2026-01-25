import { Role, SubscriptionStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env.schema';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageService } from './usage.service';

type PrismaMock = {
    subscription: {
        findUnique: jest.Mock;
        findMany: jest.Mock;
    };
    usageRecord: {
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
            subscription: {
                findUnique: jest.fn(),
                findMany: jest.fn(),
            },
            usageRecord: {
                create: jest.fn(),
                groupBy: jest.fn(),
            },
        };

        configService = {
            getOrThrow: jest.fn().mockReturnValue('secret'),
        } as unknown as ConfigService<Env, true>;

        service = new UsageService(prisma as unknown as PrismaService, configService);
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
