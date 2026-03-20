import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import {
    OperationalAlertSeverity,
    OperationalMonitoringService,
} from './operational-monitoring.service';
import { OperationalAlertDeliveryService } from './operational-alert-delivery.service';

type PrismaMock = {
    backgroundJobLease: {
        findUnique: jest.Mock;
        create: jest.Mock;
        updateMany: jest.Mock;
    };
    operationalAlertState: {
        findMany: jest.Mock;
        upsert: jest.Mock;
        update: jest.Mock;
    };
    operationalAlertDeliveryTargetState: {
        findMany: jest.Mock;
        upsert: jest.Mock;
        updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
};

const buildFingerprint = (details: Record<string, unknown> | undefined) => {
    return createHash('sha256')
        .update(
            JSON.stringify({
                severity: OperationalAlertSeverity.DANGER,
                title: 'Usage ingest has failed jobs',
                message: '1 usage ingest job(s) are currently in FAILED state.',
                details: details ?? null,
            }),
        )
        .digest('hex');
};

describe('OperationalAlertDeliveryService', () => {
    let service: OperationalAlertDeliveryService;
    let prisma: PrismaMock;
    let configService: AppConfigService;
    let operationalMonitoringService: {
        listOperationalAlerts: jest.Mock;
    };
    let fetchMock: jest.Mock;

    const alert = {
        kind: 'USAGE_INGEST_FAILED_JOBS',
        severity: OperationalAlertSeverity.DANGER,
        title: 'Usage ingest has failed jobs',
        message: '1 usage ingest job(s) are currently in FAILED state.',
        details: {
            failedJobs: 1,
        },
    } as const;

    beforeEach(() => {
        prisma = {
            backgroundJobLease: {
                findUnique: jest.fn(),
                create: jest.fn(),
                updateMany: jest.fn(),
            },
            operationalAlertState: {
                findMany: jest.fn(),
                upsert: jest.fn(),
                update: jest.fn(),
            },
            operationalAlertDeliveryTargetState: {
                findMany: jest.fn(),
                upsert: jest.fn(),
                updateMany: jest.fn(),
            },
            $transaction: jest.fn(async (callback) =>
                callback({
                    backgroundJobLease: prisma.backgroundJobLease,
                }),
            ),
        };

        configService = {
            alertDeliveryEnabled: true,
            alertDeliveryWebhookUrl: 'https://alerts.example.com/webhook',
            alertDeliveryTargets: [
                {
                    key: 'webhook',
                    url: 'https://alerts.example.com/webhook',
                    host: 'alerts.example.com',
                },
            ],
            alertDeliveryIntervalSeconds: 60,
            alertDeliveryCooldownSeconds: 900,
            alertDeliveryTimeoutMs: 5_000,
            allowPrivateNetworkTargets: true,
        } as unknown as AppConfigService;

        operationalMonitoringService = {
            listOperationalAlerts: jest.fn(),
        };

        service = new OperationalAlertDeliveryService(
            prisma as unknown as PrismaService,
            configService,
            operationalMonitoringService as unknown as OperationalMonitoringService,
        );

        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('delivers a new alert and records a successful send', async () => {
        const now = new Date('2026-03-20T09:00:00.000Z');

        prisma.backgroundJobLease.findUnique.mockResolvedValue(null);
        prisma.backgroundJobLease.create.mockResolvedValue({});
        prisma.operationalAlertState.findMany.mockResolvedValue([]);
        prisma.operationalAlertState.upsert.mockResolvedValue({});
        prisma.operationalAlertState.update.mockResolvedValue({});
        prisma.operationalAlertDeliveryTargetState.findMany.mockResolvedValue(
            [],
        );
        prisma.operationalAlertDeliveryTargetState.upsert.mockResolvedValue({});
        operationalMonitoringService.listOperationalAlerts.mockResolvedValue([
            alert,
        ]);
        fetchMock.mockResolvedValue({
            ok: true,
        });

        const result = await service.syncOperationalAlerts(now);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(prisma.operationalAlertState.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    kind: alert.kind,
                    firstObservedAt: now,
                    resolvedAt: null,
                }),
            }),
        );
        expect(prisma.operationalAlertState.update).toHaveBeenCalledWith({
            where: {
                kind: alert.kind,
            },
            data: expect.objectContaining({
                lastDeliveredAt: now,
                lastDeliveryAttemptAt: now,
                lastDeliveryError: null,
            }),
        });
        expect(result).toEqual({
            delivered: 1,
            failed: 0,
            resolved: 0,
        });
    });

    it('does not resend an unchanged alert before cooldown expires', async () => {
        const now = new Date('2026-03-20T09:00:00.000Z');
        const firstObservedAt = new Date('2026-03-20T08:45:00.000Z');
        const lastDeliveredAt = new Date('2026-03-20T08:55:00.000Z');

        prisma.backgroundJobLease.findUnique.mockResolvedValue(null);
        prisma.backgroundJobLease.create.mockResolvedValue({});
        prisma.operationalAlertState.findMany.mockResolvedValue([
            {
                kind: alert.kind,
                fingerprint: buildFingerprint(alert.details),
                severity: alert.severity,
                title: alert.title,
                message: alert.message,
                details: alert.details,
                firstObservedAt,
                lastObservedAt: new Date('2026-03-20T08:58:00.000Z'),
                resolvedAt: null,
                lastDeliveredAt,
                lastDeliveryAttemptAt: lastDeliveredAt,
                deliveryCount: 1,
                deliveryFailures: 0,
                lastDeliveryError: null,
                updatedAt: lastDeliveredAt,
            },
        ]);
        prisma.operationalAlertDeliveryTargetState.findMany.mockResolvedValue([
            {
                alertKind: alert.kind,
                targetKey: 'webhook',
                fingerprint: buildFingerprint(alert.details),
                resolvedAt: null,
                lastDeliveredAt,
                lastDeliveryAttemptAt: lastDeliveredAt,
                deliveryCount: 1,
                deliveryFailures: 0,
                lastDeliveryError: null,
                updatedAt: lastDeliveredAt,
            },
        ]);
        prisma.operationalAlertState.upsert.mockResolvedValue({});
        operationalMonitoringService.listOperationalAlerts.mockResolvedValue([
            alert,
        ]);

        const result = await service.syncOperationalAlerts(now);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(prisma.operationalAlertState.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({
                    firstObservedAt,
                }),
            }),
        );
        expect(result).toEqual({
            delivered: 0,
            failed: 0,
            resolved: 0,
        });
    });

    it('marks delivery failure details when the webhook send fails', async () => {
        const now = new Date('2026-03-20T09:00:00.000Z');

        prisma.backgroundJobLease.findUnique.mockResolvedValue(null);
        prisma.backgroundJobLease.create.mockResolvedValue({});
        prisma.operationalAlertState.findMany.mockResolvedValue([]);
        prisma.operationalAlertState.upsert.mockResolvedValue({});
        prisma.operationalAlertState.update.mockResolvedValue({});
        prisma.operationalAlertDeliveryTargetState.findMany.mockResolvedValue(
            [],
        );
        prisma.operationalAlertDeliveryTargetState.upsert.mockResolvedValue({});
        operationalMonitoringService.listOperationalAlerts.mockResolvedValue([
            alert,
        ]);
        fetchMock.mockRejectedValue(new Error('socket timeout'));

        const result = await service.syncOperationalAlerts(now);

        expect(prisma.operationalAlertState.update).toHaveBeenCalledWith({
            where: {
                kind: alert.kind,
            },
            data: expect.objectContaining({
                lastDeliveryAttemptAt: now,
                deliveryFailures: {
                    increment: 1,
                },
                lastDeliveryError: 'socket timeout',
            }),
        });
        expect(result).toEqual({
            delivered: 0,
            failed: 1,
            resolved: 0,
        });
    });

    it('marks previously active alerts as resolved when they disappear', async () => {
        const now = new Date('2026-03-20T09:00:00.000Z');

        prisma.backgroundJobLease.findUnique.mockResolvedValue(null);
        prisma.backgroundJobLease.create.mockResolvedValue({});
        prisma.operationalAlertState.findMany.mockResolvedValue([
            {
                kind: alert.kind,
                fingerprint: buildFingerprint(alert.details),
                severity: alert.severity,
                title: alert.title,
                message: alert.message,
                details: alert.details,
                firstObservedAt: new Date('2026-03-20T08:00:00.000Z'),
                lastObservedAt: new Date('2026-03-20T08:30:00.000Z'),
                resolvedAt: null,
                lastDeliveredAt: new Date('2026-03-20T08:05:00.000Z'),
                lastDeliveryAttemptAt: new Date('2026-03-20T08:05:00.000Z'),
                deliveryCount: 1,
                deliveryFailures: 0,
                lastDeliveryError: null,
                updatedAt: new Date('2026-03-20T08:30:00.000Z'),
            },
        ]);
        prisma.operationalAlertDeliveryTargetState.findMany.mockResolvedValue([
            {
                alertKind: alert.kind,
                targetKey: 'webhook',
                fingerprint: buildFingerprint(alert.details),
                resolvedAt: null,
                lastDeliveredAt: new Date('2026-03-20T08:05:00.000Z'),
                lastDeliveryAttemptAt: new Date('2026-03-20T08:05:00.000Z'),
                deliveryCount: 1,
                deliveryFailures: 0,
                lastDeliveryError: null,
                updatedAt: new Date('2026-03-20T08:30:00.000Z'),
            },
        ]);
        prisma.operationalAlertState.update.mockResolvedValue({});
        prisma.operationalAlertDeliveryTargetState.updateMany.mockResolvedValue({
            count: 1,
        });
        operationalMonitoringService.listOperationalAlerts.mockResolvedValue([]);

        const result = await service.syncOperationalAlerts(now);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(prisma.operationalAlertState.update).toHaveBeenCalledWith({
            where: {
                kind: alert.kind,
            },
            data: {
                resolvedAt: now,
            },
        });
        expect(result).toEqual({
            delivered: 0,
            failed: 0,
            resolved: 1,
        });
    });

    it('exposes alert delivery status summary', async () => {
        prisma.operationalAlertState.findMany.mockResolvedValue([
            {
                kind: alert.kind,
                fingerprint: buildFingerprint(alert.details),
                severity: alert.severity,
                title: alert.title,
                message: alert.message,
                details: alert.details,
                firstObservedAt: new Date('2026-03-20T08:00:00.000Z'),
                lastObservedAt: new Date('2026-03-20T08:30:00.000Z'),
                resolvedAt: null,
                lastDeliveredAt: new Date('2026-03-20T08:05:00.000Z'),
                lastDeliveryAttemptAt: new Date('2026-03-20T08:05:00.000Z'),
                deliveryCount: 1,
                deliveryFailures: 0,
                lastDeliveryError: null,
                updatedAt: new Date('2026-03-20T08:30:00.000Z'),
            },
        ]);
        prisma.operationalAlertDeliveryTargetState.findMany.mockResolvedValue([
            {
                alertKind: alert.kind,
                targetKey: 'webhook',
                fingerprint: buildFingerprint(alert.details),
                resolvedAt: null,
                lastDeliveredAt: new Date('2026-03-20T08:05:00.000Z'),
                lastDeliveryAttemptAt: new Date('2026-03-20T08:05:00.000Z'),
                deliveryCount: 1,
                deliveryFailures: 0,
                lastDeliveryError: null,
                updatedAt: new Date('2026-03-20T08:30:00.000Z'),
            },
        ]);

        const result = await service.getStatusSummary(5);

        expect(prisma.operationalAlertState.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [{ resolvedAt: 'asc' }, { updatedAt: 'desc' }],
                take: 5,
            }),
        );
        expect(
            prisma.operationalAlertDeliveryTargetState.findMany,
        ).toHaveBeenCalledWith({
            orderBy: [{ resolvedAt: 'asc' }, { updatedAt: 'desc' }],
            take: 5,
        });
        expect(result.enabled).toBe(true);
        expect(result.webhookConfigured).toBe(true);
        expect(result.configuredTargetCount).toBe(1);
        expect(result.targets).toEqual([
            {
                key: 'webhook',
                host: 'alerts.example.com',
            },
        ]);
        expect(result.items).toHaveLength(1);
        expect(result.targetItems).toHaveLength(1);
    });

    it('fans out alert delivery to every configured target', async () => {
        const now = new Date('2026-03-20T09:00:00.000Z');

        configService = {
            ...configService,
            alertDeliveryTargets: [
                {
                    key: 'primary',
                    url: 'https://alerts.example.com/webhook',
                    host: 'alerts.example.com',
                },
                {
                    key: 'backup',
                    url: 'https://backup.example.com/webhook',
                    host: 'backup.example.com',
                },
            ],
        } as AppConfigService;
        service = new OperationalAlertDeliveryService(
            prisma as unknown as PrismaService,
            configService,
            operationalMonitoringService as unknown as OperationalMonitoringService,
        );

        prisma.backgroundJobLease.findUnique.mockResolvedValue(null);
        prisma.backgroundJobLease.create.mockResolvedValue({});
        prisma.operationalAlertState.findMany.mockResolvedValue([]);
        prisma.operationalAlertState.upsert.mockResolvedValue({});
        prisma.operationalAlertState.update.mockResolvedValue({});
        prisma.operationalAlertDeliveryTargetState.findMany.mockResolvedValue(
            [],
        );
        prisma.operationalAlertDeliveryTargetState.upsert.mockResolvedValue({});
        operationalMonitoringService.listOperationalAlerts.mockResolvedValue([
            alert,
        ]);
        fetchMock.mockResolvedValue({
            ok: true,
        });

        const result = await service.syncOperationalAlerts(now);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
            delivered: 2,
            failed: 0,
            resolved: 0,
        });
    });
});
