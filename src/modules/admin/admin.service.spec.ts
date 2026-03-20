import { ProductStatus, Role, VersionStatus } from '@prisma/client';
import { AuditLogService } from '../../common/observability/audit-log.service';
import { OperationalAlertDeliveryService } from '../../common/observability/operational-alert-delivery.service';
import {
    OperationalAlertSeverity,
    OperationalMonitoringService,
} from '../../common/observability/operational-monitoring.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminService } from './admin.service';

type PrismaMock = {
    apiProduct: {
        findUnique: jest.Mock;
        update: jest.Mock;
    };
    apiVersion: {
        findUnique: jest.Mock;
        update: jest.Mock;
    };
    apiKey: {
        findUnique: jest.Mock;
        update: jest.Mock;
    };
    $transaction: jest.Mock;
};

describe('AdminService', () => {
    let service: AdminService;
    let prisma: PrismaMock;
    let auditLogService: {
        recordWithClient: jest.Mock;
        listRecent: jest.Mock;
    };
    let operationalAlertDeliveryService: {
        getStatusSummary: jest.Mock;
    };
    let operationalMonitoringService: {
        deriveOperationalAlerts: jest.Mock;
        getMetricsSnapshot: jest.Mock;
        listOperationalAlerts: jest.Mock;
    };

    const actor = {
        id: 'admin-1',
        email: 'admin@example.com',
        role: Role.ADMIN,
    } as const;

    beforeEach(() => {
        prisma = {
            apiProduct: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            apiVersion: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            apiKey: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            $transaction: jest.fn(async (callback) =>
                callback({
                    apiProduct: prisma.apiProduct,
                    apiVersion: prisma.apiVersion,
                    apiKey: prisma.apiKey,
                    auditLog: {
                        create: jest.fn(),
                    },
                }),
            ),
        };

        auditLogService = {
            recordWithClient: jest.fn(),
            listRecent: jest.fn(),
        };
        operationalAlertDeliveryService = {
            getStatusSummary: jest.fn(),
        };
        operationalMonitoringService = {
            deriveOperationalAlerts: jest.fn(),
            getMetricsSnapshot: jest.fn(),
            listOperationalAlerts: jest.fn(),
        };

        service = new AdminService(
            prisma as unknown as PrismaService,
            auditLogService as unknown as AuditLogService,
            operationalAlertDeliveryService as unknown as OperationalAlertDeliveryService,
            operationalMonitoringService as unknown as OperationalMonitoringService,
        );
    });

    it('hide product sets status to hidden', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            status: ProductStatus.PUBLISHED,
        });

        const result = await service.hideProduct(actor, 'prod-1');

        expect(prisma.apiProduct.update).toHaveBeenCalledWith({
            where: { id: 'prod-1' },
            data: { status: ProductStatus.HIDDEN },
        });
        expect(auditLogService.recordWithClient).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                actor,
                action: 'ADMIN_HIDE_PRODUCT',
                resourceType: 'API_PRODUCT',
                resourceId: 'prod-1',
            }),
        );
        expect(result).toEqual({ ok: true, productId: 'prod-1' });
    });

    it('hide version sets status to draft', async () => {
        prisma.apiVersion.findUnique.mockResolvedValue({
            id: 'ver-1',
            status: VersionStatus.PUBLISHED,
        });

        const result = await service.hideVersion(actor, 'ver-1');

        expect(prisma.apiVersion.update).toHaveBeenCalledWith({
            where: { id: 'ver-1' },
            data: { status: VersionStatus.DRAFT },
        });
        expect(auditLogService.recordWithClient).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                actor,
                action: 'ADMIN_HIDE_VERSION',
                resourceType: 'API_VERSION',
                resourceId: 'ver-1',
            }),
        );
        expect(result).toEqual({ ok: true, versionId: 'ver-1' });
    });

    it('revoke key sets inactive', async () => {
        prisma.apiKey.findUnique.mockResolvedValue({
            id: 'key-1',
            isActive: true,
            revokedAt: null,
        });

        const result = await service.revokeKey(actor, 'key-1');

        expect(prisma.apiKey.update).toHaveBeenCalledWith({
            where: { id: 'key-1' },
            data: {
                isActive: false,
                revokedAt: expect.any(Date),
            },
        });
        expect(auditLogService.recordWithClient).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                actor,
                action: 'ADMIN_REVOKE_KEY',
                resourceType: 'API_KEY',
                resourceId: 'key-1',
            }),
        );
        expect(result).toEqual({ ok: true, keyId: 'key-1' });
    });

    it('lists recent audit logs', async () => {
        auditLogService.listRecent.mockResolvedValue([
            {
                id: 'log-1',
                requestId: 'req-1',
                actorUserId: 'admin-1',
                actorEmail: 'admin@example.com',
                actorRole: 'ADMIN',
                action: 'ADMIN_HIDE_PRODUCT',
                resourceType: 'API_PRODUCT',
                resourceId: 'prod-1',
                details: { changed: true },
                createdAt: new Date('2026-03-19T12:00:00.000Z'),
            },
        ]);

        const result = await service.listAuditLogs(10);

        expect(auditLogService.listRecent).toHaveBeenCalledWith(10);
        expect(result.items).toHaveLength(1);
    });

    it('lists operational alerts', async () => {
        operationalMonitoringService.listOperationalAlerts.mockResolvedValue([
            {
                kind: 'USAGE_INGEST_FAILED_JOBS',
                severity: OperationalAlertSeverity.DANGER,
                title: 'Usage ingest has failed jobs',
                message: '1 usage ingest job(s) are currently in FAILED state.',
            },
        ]);

        const result = await service.listOperationalAlerts();

        expect(
            operationalMonitoringService.listOperationalAlerts,
        ).toHaveBeenCalled();
        expect(result.items).toHaveLength(1);
    });

    it('builds an operational dashboard summary', async () => {
        operationalMonitoringService.getMetricsSnapshot.mockResolvedValue({
            usageIngestPendingJobs: 3,
            usageIngestFailedJobs: 1,
            usageIngestOldestPendingAgeSeconds: 30,
            usageIngestLeasePresent: true,
            usageIngestLeaseSecondsUntilExpiry: 45,
            billingReconciliationLeasePresent: true,
            billingReconciliationLeaseSecondsUntilExpiry: 120,
            subscriptionsPastDue: 2,
            auditLogsLast24h: 7,
        });
        operationalMonitoringService.deriveOperationalAlerts.mockReturnValue([
            {
                kind: 'USAGE_INGEST_FAILED_JOBS',
                severity: OperationalAlertSeverity.DANGER,
                title: 'Usage ingest has failed jobs',
                message: '1 usage ingest job(s) are currently in FAILED state.',
            },
        ]);
        operationalAlertDeliveryService.getStatusSummary.mockResolvedValue({
            enabled: true,
            webhookConfigured: true,
            intervalSeconds: 60,
            cooldownSeconds: 900,
            items: [],
        });

        const result = await service.getOperationalDashboard();

        expect(
            operationalMonitoringService.getMetricsSnapshot,
        ).toHaveBeenCalled();
        expect(
            operationalMonitoringService.deriveOperationalAlerts,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                usageIngestPendingJobs: 3,
            }),
        );
        expect(
            operationalAlertDeliveryService.getStatusSummary,
        ).toHaveBeenCalledWith(10);
        expect(result.alerts).toHaveLength(1);
        expect(result.alertDelivery.enabled).toBe(true);
    });
});
