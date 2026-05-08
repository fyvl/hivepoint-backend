import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { OperationalMetricsHistoryService } from './operational-metrics-history.service';
import { OperationalMonitoringService } from './operational-monitoring.service';

type PrismaMock = {
    backgroundJobLease: {
        findUnique: jest.Mock;
        create: jest.Mock;
        updateMany: jest.Mock;
    };
    operationalMetricsHistoryPoint: {
        create: jest.Mock;
        deleteMany: jest.Mock;
        findMany: jest.Mock;
    };
    $transaction: jest.Mock;
};

describe('OperationalMetricsHistoryService', () => {
    let service: OperationalMetricsHistoryService;
    let prisma: PrismaMock;
    let configService: AppConfigService;
    let operationalMonitoringService: {
        getMetricsSnapshot: jest.Mock;
    };

    beforeEach(() => {
        prisma = {
            backgroundJobLease: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({}),
                updateMany: jest.fn(),
            },
            operationalMetricsHistoryPoint: {
                create: jest.fn().mockResolvedValue({}),
                deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
                findMany: jest.fn(),
            },
            $transaction: jest.fn(async (callback) =>
                callback({
                    backgroundJobLease: prisma.backgroundJobLease,
                }),
            ),
        };

        configService = {
            operationalMetricsHistoryEnabled: true,
            operationalMetricsHistoryIntervalSeconds: 300,
            operationalMetricsHistoryRetentionDays: 30,
        } as unknown as AppConfigService;

        operationalMonitoringService = {
            getMetricsSnapshot: jest.fn(),
        };

        service = new OperationalMetricsHistoryService(
            prisma as unknown as PrismaService,
            configService,
            operationalMonitoringService as unknown as OperationalMonitoringService,
        );
    });

    it('captures and prunes metrics history points', async () => {
        const now = new Date('2026-03-20T09:00:00.000Z');

        operationalMonitoringService.getMetricsSnapshot.mockResolvedValue({
            usageIngestPendingJobs: 12,
            usageIngestFailedJobs: 2,
            usageIngestOldestPendingAgeSeconds: 600,
            usageIngestLeasePresent: true,
            usageIngestLeaseSecondsUntilExpiry: 60,
            billingReconciliationLeasePresent: true,
            billingReconciliationLeaseSecondsUntilExpiry: 300,
            billingOverageCollectionLeasePresent: true,
            billingOverageCollectionLeaseSecondsUntilExpiry: 120,
            subscriptionsPastDue: 4,
            auditLogsLast24h: 7,
        });

        const result = await service.captureMetricsSnapshot(now);

        expect(
            operationalMonitoringService.getMetricsSnapshot,
        ).toHaveBeenCalledWith(now);
        expect(
            prisma.operationalMetricsHistoryPoint.create,
        ).toHaveBeenCalledWith({
            data: {
                capturedAt: now,
                usageIngestPendingJobs: 12,
                usageIngestFailedJobs: 2,
                usageIngestOldestPendingAgeSeconds: 600,
                usageIngestLeasePresent: true,
                usageIngestLeaseSecondsUntilExpiry: 60,
                billingReconciliationLeasePresent: true,
                billingReconciliationLeaseSecondsUntilExpiry: 300,
                billingOverageCollectionLeasePresent: true,
                billingOverageCollectionLeaseSecondsUntilExpiry: 120,
                subscriptionsPastDue: 4,
                auditLogsLast24h: 7,
            },
        });
        expect(result).toEqual({
            captured: true,
            pruned: 2,
        });
    });

    it('returns recent metrics history in ascending order', async () => {
        prisma.operationalMetricsHistoryPoint.findMany.mockResolvedValue([
            {
                capturedAt: new Date('2026-03-20T09:10:00.000Z'),
                usageIngestPendingJobs: 8,
                usageIngestFailedJobs: 1,
                usageIngestOldestPendingAgeSeconds: 120,
                usageIngestLeasePresent: true,
                usageIngestLeaseSecondsUntilExpiry: 80,
                billingReconciliationLeasePresent: true,
                billingReconciliationLeaseSecondsUntilExpiry: 240,
                billingOverageCollectionLeasePresent: true,
                billingOverageCollectionLeaseSecondsUntilExpiry: 200,
                subscriptionsPastDue: 2,
                auditLogsLast24h: 5,
            },
            {
                capturedAt: new Date('2026-03-20T09:00:00.000Z'),
                usageIngestPendingJobs: 10,
                usageIngestFailedJobs: 2,
                usageIngestOldestPendingAgeSeconds: 240,
                usageIngestLeasePresent: true,
                usageIngestLeaseSecondsUntilExpiry: 60,
                billingReconciliationLeasePresent: true,
                billingReconciliationLeaseSecondsUntilExpiry: 180,
                billingOverageCollectionLeasePresent: false,
                billingOverageCollectionLeaseSecondsUntilExpiry: 0,
                subscriptionsPastDue: 3,
                auditLogsLast24h: 6,
            },
        ]);

        const result = await service.getHistorySummary(2);

        expect(
            prisma.operationalMetricsHistoryPoint.findMany,
        ).toHaveBeenCalledWith({
            orderBy: {
                capturedAt: 'desc',
            },
            take: 2,
        });
        expect(result.enabled).toBe(true);
        expect(result.items[0]?.capturedAt).toEqual(
            new Date('2026-03-20T09:00:00.000Z'),
        );
        expect(result.items[1]?.capturedAt).toEqual(
            new Date('2026-03-20T09:10:00.000Z'),
        );
    });
});
