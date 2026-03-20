import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import {
    OperationalAlertSeverity,
    OperationalMonitoringService,
} from './operational-monitoring.service';

type PrismaMock = {
    usageIngestJob: {
        count: jest.Mock;
        findFirst: jest.Mock;
    };
    subscription: {
        count: jest.Mock;
    };
    auditLog: {
        count: jest.Mock;
    };
    backgroundJobLease: {
        findUnique: jest.Mock;
    };
};

describe('OperationalMonitoringService', () => {
    let service: OperationalMonitoringService;
    let prisma: PrismaMock;
    let configService: AppConfigService;

    beforeEach(() => {
        prisma = {
            usageIngestJob: {
                count: jest.fn(),
                findFirst: jest.fn(),
            },
            subscription: {
                count: jest.fn(),
            },
            auditLog: {
                count: jest.fn(),
            },
            backgroundJobLease: {
                findUnique: jest.fn(),
            },
        };

        configService = {
            usageIngestQueueEnabled: true,
            usageIngestQueueIntervalSeconds: 10,
            paymentProvider: 'STRIPE',
            billingReconciliationEnabled: true,
        } as unknown as AppConfigService;

        service = new OperationalMonitoringService(
            prisma as unknown as PrismaService,
            configService,
        );
    });

    it('builds a metrics snapshot from queue, lease, subscription, and audit data', async () => {
        const now = new Date('2026-03-19T12:00:00.000Z');

        prisma.usageIngestJob.count
            .mockResolvedValueOnce(12)
            .mockResolvedValueOnce(2);
        prisma.usageIngestJob.findFirst.mockResolvedValue({
            createdAt: new Date('2026-03-19T11:50:00.000Z'),
        });
        prisma.subscription.count.mockResolvedValue(4);
        prisma.auditLog.count.mockResolvedValue(7);
        prisma.backgroundJobLease.findUnique
            .mockResolvedValueOnce({
                expiresAt: new Date('2026-03-19T12:01:00.000Z'),
            })
            .mockResolvedValueOnce({
                expiresAt: new Date('2026-03-19T12:05:00.000Z'),
            });

        const snapshot = await service.getMetricsSnapshot(now);

        expect(snapshot).toEqual({
            usageIngestPendingJobs: 12,
            usageIngestFailedJobs: 2,
            usageIngestOldestPendingAgeSeconds: 600,
            usageIngestLeasePresent: true,
            usageIngestLeaseSecondsUntilExpiry: 60,
            billingReconciliationLeasePresent: true,
            billingReconciliationLeaseSecondsUntilExpiry: 300,
            subscriptionsPastDue: 4,
            auditLogsLast24h: 7,
        });
    });

    it('emits operational alerts for failed jobs, stale workers, and past due subscriptions', async () => {
        const now = new Date('2026-03-19T12:00:00.000Z');

        prisma.usageIngestJob.count
            .mockResolvedValueOnce(150)
            .mockResolvedValueOnce(3);
        prisma.usageIngestJob.findFirst.mockResolvedValue({
            createdAt: new Date('2026-03-19T11:45:00.000Z'),
        });
        prisma.subscription.count.mockResolvedValue(12);
        prisma.auditLog.count.mockResolvedValue(5);
        prisma.backgroundJobLease.findUnique
            .mockResolvedValueOnce({
                expiresAt: new Date('2026-03-19T11:59:00.000Z'),
            })
            .mockResolvedValueOnce(null);

        const alerts = await service.listOperationalAlerts(now);

        expect(alerts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'USAGE_INGEST_FAILED_JOBS',
                    severity: OperationalAlertSeverity.DANGER,
                }),
                expect.objectContaining({
                    kind: 'USAGE_INGEST_WORKER_STALE',
                    severity: OperationalAlertSeverity.DANGER,
                }),
                expect.objectContaining({
                    kind: 'USAGE_INGEST_BACKLOG',
                    severity: OperationalAlertSeverity.WARNING,
                }),
                expect.objectContaining({
                    kind: 'SUBSCRIPTIONS_PAST_DUE_HIGH',
                    severity: OperationalAlertSeverity.WARNING,
                }),
                expect.objectContaining({
                    kind: 'BILLING_RECONCILIATION_STALE',
                    severity: OperationalAlertSeverity.WARNING,
                }),
            ]),
        );
    });

    it('does not emit stale pending alerts when only failed jobs exist', async () => {
        const now = new Date('2026-03-19T12:00:00.000Z');

        prisma.usageIngestJob.count
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(2);
        prisma.usageIngestJob.findFirst.mockResolvedValue(null);
        prisma.subscription.count.mockResolvedValue(0);
        prisma.auditLog.count.mockResolvedValue(1);
        prisma.backgroundJobLease.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                expiresAt: new Date('2026-03-19T12:05:00.000Z'),
            });

        const alerts = await service.listOperationalAlerts(now);

        expect(alerts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'USAGE_INGEST_FAILED_JOBS',
                    severity: OperationalAlertSeverity.DANGER,
                }),
            ]),
        );
        expect(alerts).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'USAGE_INGEST_OLD_PENDING_JOB',
                }),
                expect.objectContaining({
                    kind: 'USAGE_INGEST_WORKER_STALE',
                }),
            ]),
        );
    });
});
