import { Injectable } from '@nestjs/common';
import { ProductStatus, VersionStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { AuditLogService } from '../../common/observability/audit-log.service';
import { OperationalAlertDeliveryService } from '../../common/observability/operational-alert-delivery.service';
import { OperationalMetricsHistoryService } from '../../common/observability/operational-metrics-history.service';
import { OperationalMonitoringService } from '../../common/observability/operational-monitoring.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HideProductResponseDto } from './dto/hide-product-response.dto';
import { HideVersionResponseDto } from './dto/hide-version-response.dto';
import { ListAuditLogsResponseDto } from './dto/list-audit-logs-response.dto';
import { OperationalDashboardResponseDto } from './dto/operational-dashboard.dto';
import { OperationalAlertsResponseDto } from './dto/operational-alert.dto';
import { RevokeKeyResponseDto } from './dto/revoke-key-response.dto';

@Injectable()
export class AdminService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditLogService: AuditLogService,
        private readonly operationalAlertDeliveryService: OperationalAlertDeliveryService,
        private readonly operationalMetricsHistoryService: OperationalMetricsHistoryService,
        private readonly operationalMonitoringService: OperationalMonitoringService,
    ) {}

    async hideProduct(
        actor: AuthenticatedUser,
        productId: string,
    ): Promise<HideProductResponseDto> {
        const product = await this.prisma.apiProduct.findUnique({
            where: { id: productId },
            select: {
                id: true,
                status: true,
            },
        });

        if (!product) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_FOUND,
                message: 'PRODUCT_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const changed = product.status !== ProductStatus.HIDDEN;
        await this.prisma.$transaction(async (tx) => {
            if (changed) {
                await tx.apiProduct.update({
                    where: { id: product.id },
                    data: { status: ProductStatus.HIDDEN },
                });
            }

            await this.auditLogService.recordWithClient(tx, {
                actor,
                action: 'ADMIN_HIDE_PRODUCT',
                resourceType: 'API_PRODUCT',
                resourceId: product.id,
                details: {
                    changed,
                    previousStatus: product.status,
                    nextStatus: ProductStatus.HIDDEN,
                },
            });
        });

        return { ok: true, productId: product.id };
    }

    async hideVersion(
        actor: AuthenticatedUser,
        versionId: string,
    ): Promise<HideVersionResponseDto> {
        const version = await this.prisma.apiVersion.findUnique({
            where: { id: versionId },
            select: {
                id: true,
                status: true,
            },
        });

        if (!version) {
            throw new AppError({
                code: ErrorCodes.VERSION_NOT_FOUND,
                message: 'VERSION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const changed = version.status !== VersionStatus.DRAFT;
        await this.prisma.$transaction(async (tx) => {
            if (changed) {
                await tx.apiVersion.update({
                    where: { id: version.id },
                    data: { status: VersionStatus.DRAFT },
                });
            }

            await this.auditLogService.recordWithClient(tx, {
                actor,
                action: 'ADMIN_HIDE_VERSION',
                resourceType: 'API_VERSION',
                resourceId: version.id,
                details: {
                    changed,
                    previousStatus: version.status,
                    nextStatus: VersionStatus.DRAFT,
                },
            });
        });

        return { ok: true, versionId: version.id };
    }

    async revokeKey(
        actor: AuthenticatedUser,
        keyId: string,
    ): Promise<RevokeKeyResponseDto> {
        const apiKey = await this.prisma.apiKey.findUnique({
            where: { id: keyId },
            select: {
                id: true,
                isActive: true,
                revokedAt: true,
            },
        });

        if (!apiKey) {
            throw new AppError({
                code: ErrorCodes.KEY_NOT_FOUND,
                message: 'KEY_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const changed = apiKey.isActive && !apiKey.revokedAt;
        await this.prisma.$transaction(async (tx) => {
            if (changed) {
                await tx.apiKey.update({
                    where: { id: apiKey.id },
                    data: {
                        isActive: false,
                        revokedAt: new Date(),
                    },
                });
            }

            await this.auditLogService.recordWithClient(tx, {
                actor,
                action: 'ADMIN_REVOKE_KEY',
                resourceType: 'API_KEY',
                resourceId: apiKey.id,
                details: {
                    changed,
                    wasActive: apiKey.isActive,
                    previousRevokedAt: apiKey.revokedAt?.toISOString() ?? null,
                },
            });
        });

        return { ok: true, keyId: apiKey.id };
    }

    async listAuditLogs(limit: number): Promise<ListAuditLogsResponseDto> {
        const items = await this.auditLogService.listRecent(limit);
        return { items };
    }

    async listOperationalAlerts(): Promise<OperationalAlertsResponseDto> {
        const items =
            await this.operationalMonitoringService.listOperationalAlerts();

        return { items };
    }

    async getOperationalDashboard(): Promise<OperationalDashboardResponseDto> {
        const snapshot =
            await this.operationalMonitoringService.getMetricsSnapshot();
        const alerts =
            this.operationalMonitoringService.deriveOperationalAlerts(snapshot);
        const [alertDelivery, metricsHistory] = await Promise.all([
            this.operationalAlertDeliveryService.getStatusSummary(10),
            this.operationalMetricsHistoryService.getHistorySummary(48),
        ]);

        return {
            snapshot,
            alerts,
            alertDelivery,
            metricsHistory,
        };
    }
}
