import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageAggregationService } from './usage-aggregation.service';

type PrismaMock = {
    usageRecord: {
        create: jest.Mock;
        aggregate: jest.Mock;
        groupBy: jest.Mock;
    };
    usageDailyAggregate: {
        upsert: jest.Mock;
        aggregate: jest.Mock;
    };
    usageEndpointDailyAggregate: {
        upsert: jest.Mock;
        groupBy: jest.Mock;
    };
    $transaction: jest.Mock;
};

describe('UsageAggregationService', () => {
    let service: UsageAggregationService;
    let prisma: PrismaMock;

    beforeEach(() => {
        prisma = {
            usageRecord: {
                create: jest.fn(),
                aggregate: jest.fn(),
                groupBy: jest.fn(),
            },
            usageDailyAggregate: {
                upsert: jest.fn(),
                aggregate: jest.fn(),
            },
            usageEndpointDailyAggregate: {
                upsert: jest.fn(),
                groupBy: jest.fn(),
            },
            $transaction: jest.fn(async (callback) =>
                callback({
                    usageRecord: prisma.usageRecord,
                    usageDailyAggregate: prisma.usageDailyAggregate,
                    usageEndpointDailyAggregate:
                        prisma.usageEndpointDailyAggregate,
                }),
            ),
        };

        service = new UsageAggregationService(
            prisma as unknown as PrismaService,
        );
    });

    it('records usage and increments the daily aggregate in one transaction', async () => {
        const occurredAt = new Date('2026-03-19T12:34:56.000Z');

        await service.recordUsage({
            subscriptionId: 'sub-1',
            occurredAt,
            endpoint: '/v1/search',
            requestCount: 2,
            sourceJobId: 'job-1',
        });

        expect(prisma.usageRecord.create).toHaveBeenCalledWith({
            data: {
                subscriptionId: 'sub-1',
                occurredAt,
                endpoint: '/v1/search',
                requestCount: 2,
                sourceJobId: 'job-1',
                aggregatedAt: expect.any(Date),
            },
        });
        expect(prisma.usageDailyAggregate.upsert).toHaveBeenCalledWith({
            where: {
                subscriptionId_bucketDate: {
                    subscriptionId: 'sub-1',
                    bucketDate: new Date('2026-03-19T00:00:00.000Z'),
                },
            },
            create: {
                subscriptionId: 'sub-1',
                bucketDate: new Date('2026-03-19T00:00:00.000Z'),
                requestCount: 2,
            },
            update: {
                requestCount: {
                    increment: 2,
                },
            },
        });
        expect(prisma.usageEndpointDailyAggregate.upsert).toHaveBeenCalledWith({
            where: {
                subscriptionId_bucketDate_endpoint: {
                    subscriptionId: 'sub-1',
                    bucketDate: new Date('2026-03-19T00:00:00.000Z'),
                    endpoint: '/v1/search',
                },
            },
            create: {
                subscriptionId: 'sub-1',
                bucketDate: new Date('2026-03-19T00:00:00.000Z'),
                endpoint: '/v1/search',
                requestCount: 2,
            },
            update: {
                requestCount: {
                    increment: 2,
                },
            },
        });
    });

    it('combines partial-day raw usage, daily aggregates, and pending raw records', async () => {
        prisma.usageRecord.aggregate
            .mockResolvedValueOnce({
                _sum: {
                    requestCount: 5,
                },
            })
            .mockResolvedValueOnce({
                _sum: {
                    requestCount: 7,
                },
            })
            .mockResolvedValueOnce({
                _sum: {
                    requestCount: 3,
                },
            });
        prisma.usageDailyAggregate.aggregate.mockResolvedValue({
            _sum: {
                requestCount: 40,
            },
        });

        const result = await service.sumUsageForWindow({
            subscriptionId: 'sub-1',
            periodStart: new Date('2026-03-01T10:00:00.000Z'),
            periodEnd: new Date('2026-03-04T06:00:00.000Z'),
        });

        expect(prisma.usageDailyAggregate.aggregate).toHaveBeenCalledWith({
            where: {
                subscriptionId: 'sub-1',
                bucketDate: {
                    gte: new Date('2026-03-02T00:00:00.000Z'),
                    lt: new Date('2026-03-04T00:00:00.000Z'),
                },
            },
            _sum: {
                requestCount: true,
            },
        });
        expect(prisma.usageRecord.aggregate).toHaveBeenNthCalledWith(2, {
            where: {
                subscriptionId: 'sub-1',
                aggregatedAt: null,
                occurredAt: {
                    gte: new Date('2026-03-02T00:00:00.000Z'),
                    lt: new Date('2026-03-04T00:00:00.000Z'),
                },
            },
            _sum: {
                requestCount: true,
            },
        });
        expect(result).toBe(55);
    });

    it('falls back to a single raw query when the window stays within one UTC day', async () => {
        prisma.usageRecord.aggregate.mockResolvedValue({
            _sum: {
                requestCount: 9,
            },
        });

        const result = await service.sumUsageForWindow({
            subscriptionId: 'sub-1',
            periodStart: new Date('2026-03-01T10:00:00.000Z'),
            periodEnd: new Date('2026-03-01T12:00:00.000Z'),
        });

        expect(prisma.usageDailyAggregate.aggregate).not.toHaveBeenCalled();
        expect(prisma.usageRecord.aggregate).toHaveBeenCalledTimes(1);
        expect(result).toBe(9);
    });

    it('returns a per-endpoint breakdown from aggregate and raw sources', async () => {
        prisma.usageRecord.groupBy
            .mockResolvedValueOnce([
                {
                    endpoint: '/v1/search',
                    _sum: {
                        requestCount: 5,
                    },
                },
            ])
            .mockResolvedValueOnce([
                {
                    endpoint: '/v1/search',
                    _sum: {
                        requestCount: 7,
                    },
                },
                {
                    endpoint: '/v1/health',
                    _sum: {
                        requestCount: 2,
                    },
                },
            ])
            .mockResolvedValueOnce([
                {
                    endpoint: '/v1/search',
                    _sum: {
                        requestCount: 3,
                    },
                },
            ]);
        prisma.usageEndpointDailyAggregate.groupBy.mockResolvedValue([
            {
                endpoint: '/v1/search',
                _sum: {
                    requestCount: 40,
                },
            },
            {
                endpoint: '/v1/health',
                _sum: {
                    requestCount: 10,
                },
            },
        ]);

        const result = await service.listEndpointUsageForWindow({
            subscriptionId: 'sub-1',
            periodStart: new Date('2026-03-01T10:00:00.000Z'),
            periodEnd: new Date('2026-03-04T06:00:00.000Z'),
        });

        expect(prisma.usageEndpointDailyAggregate.groupBy).toHaveBeenCalledWith({
            by: ['endpoint'],
            where: {
                subscriptionId: 'sub-1',
                bucketDate: {
                    gte: new Date('2026-03-02T00:00:00.000Z'),
                    lt: new Date('2026-03-04T00:00:00.000Z'),
                },
            },
            _sum: {
                requestCount: true,
            },
        });
        expect(result).toEqual([
            {
                endpoint: '/v1/search',
                requestCount: 55,
            },
            {
                endpoint: '/v1/health',
                requestCount: 12,
            },
        ]);
    });
});
