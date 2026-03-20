import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import {
    OperationalMetricsSnapshot,
    OperationalMonitoringService,
} from './operational-monitoring.service';

const METRICS_HISTORY_LEASE_NAME = 'observability:metrics-history';

export type OperationalMetricsHistoryPointRecord =
    OperationalMetricsSnapshot & {
        capturedAt: Date;
    };

export type OperationalMetricsHistorySummary = {
    enabled: boolean;
    intervalSeconds: number;
    retentionDays: number;
    items: OperationalMetricsHistoryPointRecord[];
};

@Injectable()
export class OperationalMetricsHistoryService
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(
        OperationalMetricsHistoryService.name,
    );
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
        }, this.configService.operationalMetricsHistoryIntervalSeconds * 1000);
        this.intervalHandle.unref?.();
    }

    onModuleDestroy(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    async captureMetricsSnapshot(now: Date = new Date()): Promise<{
        captured: boolean;
        pruned: number;
    }> {
        if (!this.shouldRun()) {
            return {
                captured: false,
                pruned: 0,
            };
        }

        const leaseAcquired = await this.tryAcquireLease();
        if (!leaseAcquired) {
            return {
                captured: false,
                pruned: 0,
            };
        }

        const snapshot =
            await this.operationalMonitoringService.getMetricsSnapshot(now);
        await this.prisma.operationalMetricsHistoryPoint.create({
            data: {
                capturedAt: now,
                ...snapshot,
            },
        });

        const retentionCutoff = new Date(now);
        retentionCutoff.setUTCDate(
            retentionCutoff.getUTCDate() -
                this.configService.operationalMetricsHistoryRetentionDays,
        );

        const pruned = await this.prisma.operationalMetricsHistoryPoint.deleteMany(
            {
                where: {
                    capturedAt: {
                        lt: retentionCutoff,
                    },
                },
            },
        );

        return {
            captured: true,
            pruned: pruned.count,
        };
    }

    async getHistorySummary(
        limit = 72,
    ): Promise<OperationalMetricsHistorySummary> {
        const points =
            await this.prisma.operationalMetricsHistoryPoint.findMany({
                orderBy: {
                    capturedAt: 'desc',
                },
                take: Math.max(1, Math.min(limit, 500)),
            });

        return {
            enabled: this.configService.operationalMetricsHistoryEnabled,
            intervalSeconds:
                this.configService.operationalMetricsHistoryIntervalSeconds,
            retentionDays:
                this.configService.operationalMetricsHistoryRetentionDays,
            items: [...points].reverse(),
        };
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
                        name: METRICS_HISTORY_LEASE_NAME,
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
                                name: METRICS_HISTORY_LEASE_NAME,
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
                        name: METRICS_HISTORY_LEASE_NAME,
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
            await this.captureMetricsSnapshot();
        } catch (error) {
            this.logger.warn(
                `Failed to capture metrics history snapshot: ${this.describeError(
                    error,
                )}`,
            );
        } finally {
            this.isRunning = false;
        }
    }

    private shouldRun(): boolean {
        return this.configService.operationalMetricsHistoryEnabled;
    }

    private getLeaseDurationMilliseconds(): number {
        return (
            Math.max(
                this.configService.operationalMetricsHistoryIntervalSeconds * 2,
                60,
            ) * 1000
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

        return 'Unknown metrics history error';
    }
}
