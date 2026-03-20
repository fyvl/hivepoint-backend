import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { Prisma, UsageIngestJobStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../../common/config/config.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageAggregationService } from './usage-aggregation.service';

const MAX_RETRY_DELAY_SECONDS = 300;
const MIN_RETRY_DELAY_SECONDS = 30;

type QueueJob = {
    id: string;
    subscriptionId: string;
    occurredAt: Date;
    endpoint: string;
    requestCount: number;
    attempts: number;
};

@Injectable()
export class UsageIngestWorkerService implements OnModuleInit, OnModuleDestroy {
    private static readonly LEASE_NAME = 'usage:ingest-queue';
    private readonly logger = new Logger(UsageIngestWorkerService.name);
    private readonly leaseOwnerId = randomUUID();
    private intervalHandle: NodeJS.Timeout | null = null;
    private isRunning = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: AppConfigService,
        private readonly usageAggregationService: UsageAggregationService,
    ) {}

    onModuleInit(): void {
        if (!this.shouldRun()) {
            return;
        }

        void this.runScheduledCycle();

        this.intervalHandle = setInterval(() => {
            void this.runScheduledCycle();
        }, this.configService.usageIngestQueueIntervalSeconds * 1000);
        this.intervalHandle.unref?.();
    }

    onModuleDestroy(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    async drainQueue(): Promise<{ processed: number; failed: number }> {
        if (!this.shouldRun()) {
            return {
                processed: 0,
                failed: 0,
            };
        }

        const leaseAcquired = await this.tryAcquireLease();
        if (!leaseAcquired) {
            return {
                processed: 0,
                failed: 0,
            };
        }

        const now = new Date();
        const jobs = await this.prisma.usageIngestJob.findMany({
            where: {
                status: {
                    in: [
                        UsageIngestJobStatus.PENDING,
                        UsageIngestJobStatus.FAILED,
                    ],
                },
                availableAt: {
                    lte: now,
                },
            },
            orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
            take: this.configService.usageIngestQueueBatchSize,
            select: {
                id: true,
                subscriptionId: true,
                occurredAt: true,
                endpoint: true,
                requestCount: true,
                attempts: true,
            },
        });

        let processed = 0;
        let failed = 0;

        for (const job of jobs) {
            try {
                await this.processJob(job);
                processed += 1;
            } catch (error) {
                failed += 1;
                this.logger.warn(
                    `Failed to process usage ingest job ${job.id}: ${this.describeError(
                        error,
                    )}`,
                );
            }
        }

        return {
            processed,
            failed,
        };
    }

    private async processJob(job: QueueJob): Promise<void> {
        try {
            await this.prisma.$transaction(async (tx) => {
                await this.usageAggregationService.recordUsageInTransaction(
                    tx,
                    {
                        subscriptionId: job.subscriptionId,
                        occurredAt: job.occurredAt,
                        endpoint: job.endpoint,
                        requestCount: job.requestCount,
                        sourceJobId: job.id,
                    },
                );
                await tx.usageIngestJob.update({
                    where: { id: job.id },
                    data: {
                        status: UsageIngestJobStatus.PROCESSED,
                        processedAt: new Date(),
                        lastError: null,
                    },
                });
            });
        } catch (error) {
            if (this.isDuplicateSourceJobError(error)) {
                await this.markJobProcessed(job.id);
                return;
            }

            await this.markJobFailed(job.id, job.attempts + 1, error);
            throw error;
        }
    }

    private async markJobProcessed(jobId: string): Promise<void> {
        await this.prisma.usageIngestJob.update({
            where: { id: jobId },
            data: {
                status: UsageIngestJobStatus.PROCESSED,
                processedAt: new Date(),
                lastError: null,
            },
        });
    }

    private async markJobFailed(
        jobId: string,
        attempts: number,
        error: unknown,
    ): Promise<void> {
        await this.prisma.usageIngestJob.update({
            where: { id: jobId },
            data: {
                status: UsageIngestJobStatus.FAILED,
                attempts,
                availableAt: new Date(
                    Date.now() + this.getRetryDelayMilliseconds(attempts),
                ),
                lastError: this.describeError(error).slice(0, 1000),
            },
        });
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
                        name: UsageIngestWorkerService.LEASE_NAME,
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
                                name: UsageIngestWorkerService.LEASE_NAME,
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
                        name: UsageIngestWorkerService.LEASE_NAME,
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
            await this.drainQueue();
        } finally {
            this.isRunning = false;
        }
    }

    private shouldRun(): boolean {
        return this.configService.usageIngestQueueEnabled;
    }

    private getLeaseDurationMilliseconds(): number {
        return (
            Math.max(
                this.configService.usageIngestQueueIntervalSeconds * 2,
                60,
            ) * 1000
        );
    }

    private getRetryDelayMilliseconds(attempts: number): number {
        const delaySeconds = Math.min(
            MAX_RETRY_DELAY_SECONDS,
            Math.max(
                MIN_RETRY_DELAY_SECONDS,
                attempts * MIN_RETRY_DELAY_SECONDS,
            ),
        );

        return delaySeconds * 1000;
    }

    private isDuplicateSourceJobError(error: unknown): boolean {
        const prismaError = error as {
            code?: string;
            meta?: {
                target?: unknown;
            };
        };

        return (
            prismaError?.code === 'P2002' &&
            Array.isArray(prismaError.meta?.target) &&
            prismaError.meta.target.includes('sourceJobId')
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

        return 'Unknown usage ingest error';
    }
}
