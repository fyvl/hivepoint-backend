import { UsageIngestJobStatus } from '@prisma/client';
import { AppConfigService } from '../../common/config/config.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageAggregationService } from './usage-aggregation.service';
import { UsageIngestWorkerService } from './usage-ingest-worker.service';

type PrismaMock = {
    backgroundJobLease: {
        findUnique: jest.Mock;
        create: jest.Mock;
        updateMany: jest.Mock;
    };
    usageIngestJob: {
        findMany: jest.Mock;
        update: jest.Mock;
    };
    $transaction: jest.Mock;
};

describe('UsageIngestWorkerService', () => {
    let service: UsageIngestWorkerService;
    let prisma: PrismaMock;
    let configService: AppConfigService;
    let usageAggregationService: {
        recordUsageInTransaction: jest.Mock;
    };

    beforeEach(() => {
        prisma = {
            backgroundJobLease: {
                findUnique: jest.fn(),
                create: jest.fn(),
                updateMany: jest.fn(),
            },
            usageIngestJob: {
                findMany: jest.fn(),
                update: jest.fn(),
            },
            $transaction: jest.fn(async (callback) =>
                callback({
                    backgroundJobLease: prisma.backgroundJobLease,
                    usageIngestJob: prisma.usageIngestJob,
                }),
            ),
        };

        configService = {
            usageIngestQueueEnabled: true,
            usageIngestQueueIntervalSeconds: 10,
            usageIngestQueueBatchSize: 25,
        } as unknown as AppConfigService;

        usageAggregationService = {
            recordUsageInTransaction: jest.fn(),
        };

        service = new UsageIngestWorkerService(
            prisma as unknown as PrismaService,
            configService,
            usageAggregationService as unknown as UsageAggregationService,
        );
    });

    it('processes pending usage ingest jobs into usage records', async () => {
        const occurredAt = new Date('2026-03-19T12:00:00.000Z');

        prisma.backgroundJobLease.findUnique.mockResolvedValue(null);
        prisma.backgroundJobLease.create.mockResolvedValue({});
        prisma.usageIngestJob.findMany.mockResolvedValue([
            {
                id: 'job-1',
                subscriptionId: 'sub-1',
                occurredAt,
                endpoint: '/v1/search',
                requestCount: 2,
                attempts: 0,
            },
        ]);
        usageAggregationService.recordUsageInTransaction.mockResolvedValue(
            undefined,
        );
        prisma.usageIngestJob.update.mockResolvedValue({});

        const result = await service.drainQueue();

        expect(
            usageAggregationService.recordUsageInTransaction,
        ).toHaveBeenCalledWith(expect.any(Object), {
            subscriptionId: 'sub-1',
            occurredAt,
            endpoint: '/v1/search',
            requestCount: 2,
            sourceJobId: 'job-1',
        });
        expect(prisma.usageIngestJob.update).toHaveBeenCalledWith({
            where: { id: 'job-1' },
            data: {
                status: UsageIngestJobStatus.PROCESSED,
                processedAt: expect.any(Date),
                lastError: null,
            },
        });
        expect(result).toEqual({
            processed: 1,
            failed: 0,
        });
    });

    it('marks jobs as processed when the source job was already persisted', async () => {
        prisma.backgroundJobLease.findUnique.mockResolvedValue(null);
        prisma.backgroundJobLease.create.mockResolvedValue({});
        prisma.usageIngestJob.findMany.mockResolvedValue([
            {
                id: 'job-1',
                subscriptionId: 'sub-1',
                occurredAt: new Date('2026-03-19T12:00:00.000Z'),
                endpoint: '/v1/search',
                requestCount: 2,
                attempts: 1,
            },
        ]);
        usageAggregationService.recordUsageInTransaction.mockRejectedValue({
            code: 'P2002',
            meta: {
                target: ['sourceJobId'],
            },
        });
        prisma.usageIngestJob.update.mockResolvedValue({});

        const result = await service.drainQueue();

        expect(prisma.usageIngestJob.update).toHaveBeenCalledWith({
            where: { id: 'job-1' },
            data: {
                status: UsageIngestJobStatus.PROCESSED,
                processedAt: expect.any(Date),
                lastError: null,
            },
        });
        expect(result).toEqual({
            processed: 1,
            failed: 0,
        });
    });

    it('marks jobs as failed and schedules a retry when persistence fails', async () => {
        prisma.backgroundJobLease.findUnique.mockResolvedValue(null);
        prisma.backgroundJobLease.create.mockResolvedValue({});
        prisma.usageIngestJob.findMany.mockResolvedValue([
            {
                id: 'job-1',
                subscriptionId: 'sub-1',
                occurredAt: new Date('2026-03-19T12:00:00.000Z'),
                endpoint: '/v1/search',
                requestCount: 2,
                attempts: 0,
            },
        ]);
        usageAggregationService.recordUsageInTransaction.mockRejectedValue(
            new Error('db down'),
        );
        prisma.usageIngestJob.update.mockResolvedValue({});

        const result = await service.drainQueue();

        expect(prisma.usageIngestJob.update).toHaveBeenCalledWith({
            where: { id: 'job-1' },
            data: expect.objectContaining({
                status: UsageIngestJobStatus.FAILED,
                attempts: 1,
                availableAt: expect.any(Date),
                lastError: 'db down',
            }),
        });
        expect(result).toEqual({
            processed: 0,
            failed: 1,
        });
    });

    it('skips queue draining when another instance owns the lease', async () => {
        prisma.backgroundJobLease.findUnique.mockResolvedValue({
            ownerId: 'other-node',
            expiresAt: new Date(Date.now() + 60_000),
        });

        const result = await service.drainQueue();

        expect(prisma.usageIngestJob.findMany).not.toHaveBeenCalled();
        expect(result).toEqual({
            processed: 0,
            failed: 0,
        });
    });
});
