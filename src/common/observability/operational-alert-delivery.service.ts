import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import {
    AlertDeliveryTargetConfig,
    AppConfigService,
} from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertSafeExternalHttpUrl } from '../utils/external-url';
import {
    OperationalAlert,
    OperationalMonitoringService,
} from './operational-monitoring.service';

const ALERT_DELIVERY_LEASE_NAME = 'observability:alert-delivery';

type OperationalAlertStateRecord = {
    kind: string;
    fingerprint: string;
    severity: string;
    title: string;
    message: string;
    details: Prisma.JsonValue | null;
    firstObservedAt: Date;
    lastObservedAt: Date;
    resolvedAt: Date | null;
    lastDeliveredAt: Date | null;
    lastDeliveryAttemptAt: Date | null;
    deliveryCount: number;
    deliveryFailures: number;
    lastDeliveryError: string | null;
    updatedAt: Date;
};

type OperationalAlertDeliveryTargetStateRecord = {
    alertKind: string;
    targetKey: string;
    fingerprint: string;
    resolvedAt: Date | null;
    lastDeliveredAt: Date | null;
    lastDeliveryAttemptAt: Date | null;
    deliveryCount: number;
    deliveryFailures: number;
    lastDeliveryError: string | null;
    updatedAt: Date;
};

export type OperationalAlertDeliveryStatusSummary = {
    enabled: boolean;
    webhookConfigured: boolean;
    configuredTargetCount: number;
    targets: Array<{
        key: string;
        host: string;
    }>;
    intervalSeconds: number;
    cooldownSeconds: number;
    items: OperationalAlertStateRecord[];
    targetItems: OperationalAlertDeliveryTargetStateRecord[];
};

@Injectable()
export class OperationalAlertDeliveryService
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(OperationalAlertDeliveryService.name);
    private readonly leaseOwnerId = randomUUID();
    private intervalHandle: NodeJS.Timeout | null = null;
    private isRunning = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: AppConfigService,
        private readonly operationalMonitoringService: OperationalMonitoringService,
    ) {}

    onModuleInit(): void {
        if (!this.shouldRun()) {
            return;
        }

        void this.runScheduledCycle();

        this.intervalHandle = setInterval(() => {
            void this.runScheduledCycle();
        }, this.configService.alertDeliveryIntervalSeconds * 1000);
        this.intervalHandle.unref?.();
    }

    onModuleDestroy(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    async syncOperationalAlerts(now: Date = new Date()): Promise<{
        delivered: number;
        failed: number;
        resolved: number;
    }> {
        if (!this.shouldRun()) {
            return {
                delivered: 0,
                failed: 0,
                resolved: 0,
            };
        }

        const leaseAcquired = await this.tryAcquireLease();
        if (!leaseAcquired) {
            return {
                delivered: 0,
                failed: 0,
                resolved: 0,
            };
        }

        const alerts = await this.operationalMonitoringService.listOperationalAlerts(
            now,
        );
        const targets = this.configService.alertDeliveryTargets;
        const activeKinds = alerts.map((alert) => alert.kind);
        const existingStates = await this.loadRelevantStates(activeKinds);
        const statesByKind = new Map(
            existingStates.map((state) => [state.kind, state]),
        );
        const existingTargetStates = await this.loadRelevantTargetStates(
            activeKinds,
            targets.map((target) => target.key),
        );
        const targetStatesByKey = new Map(
            existingTargetStates.map((state) => [
                this.toTargetStateMapKey(state.alertKind, state.targetKey),
                state,
            ]),
        );

        let delivered = 0;
        let failed = 0;

        for (const alert of alerts) {
            const fingerprint = this.buildFingerprint(alert);
            const existingState = statesByKind.get(alert.kind) ?? null;
            const shouldSend = this.shouldSendNotification(
                existingState,
                fingerprint,
                now,
            );
            const firstObservedAt = this.resolveFirstObservedAt(
                existingState,
                fingerprint,
                now,
            );

            await this.upsertObservedState(alert, fingerprint, firstObservedAt, now);

            if (!shouldSend) {
                if (targets.length === 0) {
                    continue;
                }
            }

            for (const target of targets) {
                const targetState =
                    targetStatesByKey.get(
                        this.toTargetStateMapKey(alert.kind, target.key),
                    ) ?? null;
                const shouldSendToTarget = this.shouldSendNotification(
                    targetState,
                    fingerprint,
                    now,
                );

                if (!shouldSendToTarget) {
                    continue;
                }

                const isReminder =
                    targetState !== null &&
                    targetState.resolvedAt === null &&
                    targetState.fingerprint === fingerprint &&
                    targetState.lastDeliveredAt !== null;

                try {
                    await this.deliverAlert(
                        target,
                        alert,
                        firstObservedAt,
                        now,
                        isReminder,
                    );
                    await Promise.all([
                        this.markDeliverySuccess(alert.kind, now),
                        this.markTargetDeliverySuccess(
                            alert.kind,
                            target,
                            fingerprint,
                            now,
                        ),
                    ]);
                    delivered += 1;
                } catch (error) {
                    await Promise.all([
                        this.markDeliveryFailure(alert.kind, now, error),
                        this.markTargetDeliveryFailure(
                            alert.kind,
                            target,
                            fingerprint,
                            now,
                            error,
                        ),
                    ]);
                    failed += 1;
                    this.logger.warn(
                        `Failed to deliver alert ${alert.kind} to ${target.key}: ${this.describeError(
                            error,
                        )}`,
                    );
                }
            }
        }

        const resolved = await this.resolveClearedAlerts(
            existingStates,
            new Set(activeKinds),
            now,
        );

        return {
            delivered,
            failed,
            resolved,
        };
    }

    async getStatusSummary(
        limit = 10,
    ): Promise<OperationalAlertDeliveryStatusSummary> {
        const normalizedLimit = Math.max(1, Math.min(limit, 100));
        const [items, targetItems] = await Promise.all([
            this.prisma.operationalAlertState.findMany({
                orderBy: [{ resolvedAt: 'asc' }, { updatedAt: 'desc' }],
                take: normalizedLimit,
            }),
            this.prisma.operationalAlertDeliveryTargetState.findMany({
                orderBy: [{ resolvedAt: 'asc' }, { updatedAt: 'desc' }],
                take: normalizedLimit,
            }),
        ]);
        const targets = this.configService.alertDeliveryTargets.map((target) => ({
            key: target.key,
            host: target.host,
        }));

        return {
            enabled: this.configService.alertDeliveryEnabled,
            webhookConfigured: targets.length > 0,
            configuredTargetCount: targets.length,
            targets,
            intervalSeconds: this.configService.alertDeliveryIntervalSeconds,
            cooldownSeconds: this.configService.alertDeliveryCooldownSeconds,
            items,
            targetItems,
        };
    }

    private async loadRelevantStates(
        activeKinds: string[],
    ): Promise<OperationalAlertStateRecord[]> {
        const clauses: Prisma.OperationalAlertStateWhereInput[] = [
            {
                resolvedAt: null,
            },
        ];

        if (activeKinds.length > 0) {
            clauses.push({
                kind: {
                    in: activeKinds,
                },
            });
        }

        return this.prisma.operationalAlertState.findMany({
            where: {
                OR: clauses,
            },
        });
    }

    private async loadRelevantTargetStates(
        activeKinds: string[],
        targetKeys: string[],
    ): Promise<OperationalAlertDeliveryTargetStateRecord[]> {
        const clauses: Prisma.OperationalAlertDeliveryTargetStateWhereInput[] = [
            {
                resolvedAt: null,
            },
        ];

        if (activeKinds.length > 0) {
            clauses.push({
                alertKind: {
                    in: activeKinds,
                },
            });
        }

        if (targetKeys.length > 0) {
            clauses.push({
                targetKey: {
                    in: targetKeys,
                },
            });
        }

        return this.prisma.operationalAlertDeliveryTargetState.findMany({
            where: {
                OR: clauses,
            },
        });
    }

    private async upsertObservedState(
        alert: OperationalAlert,
        fingerprint: string,
        firstObservedAt: Date,
        now: Date,
    ): Promise<void> {
        await this.prisma.operationalAlertState.upsert({
            where: {
                kind: alert.kind,
            },
            create: {
                kind: alert.kind,
                fingerprint,
                severity: alert.severity,
                title: alert.title,
                message: alert.message,
                details: this.toJsonValue(alert.details),
                firstObservedAt,
                lastObservedAt: now,
                resolvedAt: null,
            },
            update: {
                fingerprint,
                severity: alert.severity,
                title: alert.title,
                message: alert.message,
                details: this.toJsonValue(alert.details),
                firstObservedAt,
                lastObservedAt: now,
                resolvedAt: null,
            },
        });
    }

    private async markDeliverySuccess(kind: string, now: Date): Promise<void> {
        await this.prisma.operationalAlertState.update({
            where: {
                kind,
            },
            data: {
                lastDeliveredAt: now,
                lastDeliveryAttemptAt: now,
                lastDeliveryError: null,
                deliveryCount: {
                    increment: 1,
                },
            },
        });
    }

    private async markDeliveryFailure(
        kind: string,
        now: Date,
        error: unknown,
    ): Promise<void> {
        await this.prisma.operationalAlertState.update({
            where: {
                kind,
            },
            data: {
                lastDeliveryAttemptAt: now,
                deliveryFailures: {
                    increment: 1,
                },
                lastDeliveryError: this.describeError(error).slice(0, 1000),
            },
        });
    }

    private async markTargetDeliverySuccess(
        alertKind: string,
        target: AlertDeliveryTargetConfig,
        fingerprint: string,
        now: Date,
    ): Promise<void> {
        await this.prisma.operationalAlertDeliveryTargetState.upsert({
            where: {
                alertKind_targetKey: {
                    alertKind,
                    targetKey: target.key,
                },
            },
            create: {
                alertKind,
                targetKey: target.key,
                fingerprint,
                resolvedAt: null,
                lastDeliveredAt: now,
                lastDeliveryAttemptAt: now,
                deliveryCount: 1,
                deliveryFailures: 0,
                lastDeliveryError: null,
            },
            update: {
                fingerprint,
                resolvedAt: null,
                lastDeliveredAt: now,
                lastDeliveryAttemptAt: now,
                lastDeliveryError: null,
                deliveryCount: {
                    increment: 1,
                },
            },
        });
    }

    private async markTargetDeliveryFailure(
        alertKind: string,
        target: AlertDeliveryTargetConfig,
        fingerprint: string,
        now: Date,
        error: unknown,
    ): Promise<void> {
        await this.prisma.operationalAlertDeliveryTargetState.upsert({
            where: {
                alertKind_targetKey: {
                    alertKind,
                    targetKey: target.key,
                },
            },
            create: {
                alertKind,
                targetKey: target.key,
                fingerprint,
                resolvedAt: null,
                lastDeliveredAt: null,
                lastDeliveryAttemptAt: now,
                deliveryCount: 0,
                deliveryFailures: 1,
                lastDeliveryError: this.describeError(error).slice(0, 1000),
            },
            update: {
                fingerprint,
                resolvedAt: null,
                lastDeliveryAttemptAt: now,
                deliveryFailures: {
                    increment: 1,
                },
                lastDeliveryError: this.describeError(error).slice(0, 1000),
            },
        });
    }

    private async resolveClearedAlerts(
        existingStates: OperationalAlertStateRecord[],
        activeKinds: Set<string>,
        now: Date,
    ): Promise<number> {
        let resolved = 0;

        for (const state of existingStates) {
            if (state.resolvedAt !== null || activeKinds.has(state.kind)) {
                continue;
            }

            await this.prisma.operationalAlertState.update({
                where: {
                    kind: state.kind,
                },
                data: {
                    resolvedAt: now,
                },
            });
            await this.prisma.operationalAlertDeliveryTargetState.updateMany({
                where: {
                    alertKind: state.kind,
                    resolvedAt: null,
                },
                data: {
                    resolvedAt: now,
                },
            });
            resolved += 1;
        }

        return resolved;
    }

    private shouldSendNotification(
        state:
            | Pick<
                  OperationalAlertStateRecord,
                  'resolvedAt' | 'fingerprint' | 'lastDeliveredAt'
              >
            | Pick<
                  OperationalAlertDeliveryTargetStateRecord,
                  'resolvedAt' | 'fingerprint' | 'lastDeliveredAt'
              >
            | null,
        fingerprint: string,
        now: Date,
    ): boolean {
        if (!state) {
            return true;
        }

        if (state.resolvedAt !== null) {
            return true;
        }

        if (state.fingerprint !== fingerprint) {
            return true;
        }

        if (!state.lastDeliveredAt) {
            return true;
        }

        return (
            now.getTime() - state.lastDeliveredAt.getTime() >=
            this.configService.alertDeliveryCooldownSeconds * 1000
        );
    }

    private resolveFirstObservedAt(
        state: OperationalAlertStateRecord | null,
        fingerprint: string,
        now: Date,
    ): Date {
        if (!state) {
            return now;
        }

        if (state.resolvedAt !== null) {
            return now;
        }

        if (state.fingerprint !== fingerprint) {
            return now;
        }

        return state.firstObservedAt;
    }

    private async deliverAlert(
        target: AlertDeliveryTargetConfig,
        alert: OperationalAlert,
        firstObservedAt: Date,
        now: Date,
        isReminder: boolean,
    ): Promise<void> {
        const safeUrl = await assertSafeExternalHttpUrl(target.url, {
            allowPrivateNetworkTargets:
                this.configService.allowPrivateNetworkTargets,
            message: 'ALERT_DELIVERY_WEBHOOK_URL_NOT_ALLOWED',
            httpStatus: 500,
        });

        const abortController = new AbortController();
        const timeout = setTimeout(() => {
            abortController.abort();
        }, this.configService.alertDeliveryTimeoutMs);

        try {
            const response = await fetch(safeUrl, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    event: isReminder ? 'ALERT_REMINDER' : 'ALERT_ACTIVE',
                    source: 'hivepoint-backend',
                    target: target.key,
                    generatedAt: now.toISOString(),
                    alert: {
                        ...alert,
                        firstObservedAt: firstObservedAt.toISOString(),
                        lastObservedAt: now.toISOString(),
                    },
                }),
                signal: abortController.signal,
            });

            if (response.ok) {
                return;
            }

            const responseBody = await response.text().catch(() => '');
            const detail = responseBody.trim().slice(0, 300);
            throw new Error(
                detail.length > 0
                    ? `Webhook responded with ${response.status}: ${detail}`
                    : `Webhook responded with ${response.status}`,
            );
        } finally {
            clearTimeout(timeout);
        }
    }

    private async tryAcquireLease(): Promise<boolean> {
        const now = new Date();
        const expiresAt = new Date(
            now.getTime() + this.getLeaseDurationMilliseconds(),
        );

        return this.prisma.$transaction(
            async (tx) => {
                const lease = await tx.backgroundJobLease.findUnique({
                    where: {
                        name: ALERT_DELIVERY_LEASE_NAME,
                    },
                    select: {
                        ownerId: true,
                        expiresAt: true,
                    },
                });

                if (!lease) {
                    try {
                        await tx.backgroundJobLease.create({
                            data: {
                                name: ALERT_DELIVERY_LEASE_NAME,
                                ownerId: this.leaseOwnerId,
                                expiresAt,
                            },
                        });

                        return true;
                    } catch (error) {
                        if (this.isUniqueConstraintError(error)) {
                            return false;
                        }

                        throw error;
                    }
                }

                if (
                    lease.ownerId !== this.leaseOwnerId &&
                    lease.expiresAt > now
                ) {
                    return false;
                }

                const updated = await tx.backgroundJobLease.updateMany({
                    where: {
                        name: ALERT_DELIVERY_LEASE_NAME,
                        ownerId: lease.ownerId,
                        expiresAt: lease.expiresAt,
                    },
                    data: {
                        ownerId: this.leaseOwnerId,
                        expiresAt,
                    },
                });

                return updated.count === 1;
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            },
        );
    }

    private async runScheduledCycle(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        try {
            await this.syncOperationalAlerts();
        } catch (error) {
            this.logger.warn(
                `Failed to run alert delivery cycle: ${this.describeError(
                    error,
                )}`,
            );
        } finally {
            this.isRunning = false;
        }
    }

    private shouldRun(): boolean {
        return (
            this.configService.alertDeliveryEnabled &&
            this.configService.alertDeliveryTargets.length > 0
        );
    }

    private buildFingerprint(alert: OperationalAlert): string {
        return createHash('sha256')
            .update(
                JSON.stringify({
                    severity: alert.severity,
                    title: alert.title,
                    message: alert.message,
                    details: alert.details ?? null,
                }),
            )
            .digest('hex');
    }

    private toJsonValue(
        value: OperationalAlert['details'],
    ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
        return value ? (value as Prisma.InputJsonValue) : Prisma.JsonNull;
    }

    private getLeaseDurationMilliseconds(): number {
        return (
            Math.max(this.configService.alertDeliveryIntervalSeconds * 2, 60) *
            1000
        );
    }

    private isUniqueConstraintError(error: unknown): boolean {
        const prismaError = error as {
            code?: string;
        };

        return prismaError?.code === 'P2002';
    }

    private describeError(error: unknown): string {
        if (error instanceof Error && error.message.trim().length > 0) {
            return error.message;
        }

        return 'Unknown alert delivery error';
    }

    private toTargetStateMapKey(alertKind: string, targetKey: string): string {
        return `${alertKind}:${targetKey}`;
    }
}
