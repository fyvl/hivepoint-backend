import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppConfigService } from '../../common/config/config.service';
import { PrismaService } from '../../common/prisma/prisma.service';

export type GatewayBurstLimitDecision = {
    allowed: boolean;
    burstLimit: number | null;
    remainingBurstRequests: number | null;
    burstWindowSeconds: number | null;
    retryAfterSeconds: number | null;
};

@Injectable()
export class GatewayBurstLimiterService {
    private static readonly MAX_TRANSACTION_RETRIES = 3;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: AppConfigService,
    ) {}

    async checkAndConsume(params: {
        key: string;
        requestCount: number;
        rateLimitRpm: number | null | undefined;
        now?: number;
    }): Promise<GatewayBurstLimitDecision> {
        const burstLimit = this.resolveBurstLimit(params.rateLimitRpm);
        if (!burstLimit) {
            return {
                allowed: true,
                burstLimit: null,
                remainingBurstRequests: null,
                burstWindowSeconds: null,
                retryAfterSeconds: null,
            };
        }

        const now = new Date(params.now ?? Date.now());
        const refillRatePerSecond =
            burstLimit / this.configService.gatewayBurstWindowSeconds;

        if (params.requestCount > burstLimit) {
            return {
                allowed: false,
                burstLimit,
                remainingBurstRequests: burstLimit,
                burstWindowSeconds: this.configService.gatewayBurstWindowSeconds,
                retryAfterSeconds: null,
            };
        }

        for (
            let attempt = 0;
            attempt < GatewayBurstLimiterService.MAX_TRANSACTION_RETRIES;
            attempt += 1
        ) {
            try {
                return await this.prisma.$transaction(
                    async (tx) => {
                        const bucket = await this.lockBucketRow(
                            tx,
                            params.key,
                            burstLimit,
                            now,
                        );
                        const refilledTokens = this.refillTokens(
                            bucket.tokens,
                            bucket.lastRefillAt,
                            now,
                            burstLimit,
                            refillRatePerSecond,
                        );

                        if (refilledTokens < params.requestCount) {
                            await tx.gatewayBurstBucket.update({
                                where: {
                                    key: params.key,
                                },
                                data: {
                                    tokens: refilledTokens,
                                    lastRefillAt: now,
                                },
                            });

                            return {
                                allowed: false,
                                burstLimit,
                                remainingBurstRequests: Math.max(
                                    0,
                                    Math.floor(refilledTokens),
                                ),
                                burstWindowSeconds:
                                    this.configService
                                        .gatewayBurstWindowSeconds,
                                retryAfterSeconds: Math.max(
                                    1,
                                    Math.ceil(
                                        (params.requestCount -
                                            refilledTokens) /
                                            refillRatePerSecond,
                                    ),
                                ),
                            };
                        }

                        const remainingTokens =
                            refilledTokens - params.requestCount;

                        await tx.gatewayBurstBucket.update({
                            where: {
                                key: params.key,
                            },
                            data: {
                                tokens: remainingTokens,
                                lastRefillAt: now,
                            },
                        });

                        return {
                            allowed: true,
                            burstLimit,
                            remainingBurstRequests: Math.max(
                                0,
                                Math.floor(remainingTokens),
                            ),
                            burstWindowSeconds:
                                this.configService.gatewayBurstWindowSeconds,
                            retryAfterSeconds: null,
                        };
                    },
                    {
                        isolationLevel:
                            Prisma.TransactionIsolationLevel.Serializable,
                    },
                );
            } catch (error) {
                if (
                    this.isRetryableTransactionError(error) &&
                    attempt <
                        GatewayBurstLimiterService.MAX_TRANSACTION_RETRIES - 1
                ) {
                    continue;
                }

                throw error;
            }
        }

        return {
            allowed: false,
            burstLimit,
            remainingBurstRequests: 0,
            burstWindowSeconds: this.configService.gatewayBurstWindowSeconds,
            retryAfterSeconds: 1,
        };
    }

    private resolveBurstLimit(
        rateLimitRpm: number | null | undefined,
    ): number | null {
        if (
            !this.configService.gatewayBurstLimitEnabled ||
            typeof rateLimitRpm !== 'number' ||
            rateLimitRpm <= 0
        ) {
            return null;
        }

        const burstLimit = Math.ceil(
            (rateLimitRpm *
                this.configService.gatewayBurstWindowSeconds *
                this.configService.gatewayBurstMultiplier) /
                60,
        );

        return Math.min(
            this.configService.gatewayBurstMaxRequests,
            Math.max(this.configService.gatewayBurstMinRequests, burstLimit),
        );
    }

    private async lockBucketRow(
        tx: Prisma.TransactionClient,
        key: string,
        burstLimit: number,
        now: Date,
    ): Promise<{
        key: string;
        tokens: number;
        lastRefillAt: Date;
    }> {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const existingBucket = await tx.gatewayBurstBucket.findUnique({
                where: {
                    key,
                },
                select: {
                    key: true,
                    tokens: true,
                    lastRefillAt: true,
                },
            });

            if (!existingBucket) {
                try {
                    await tx.gatewayBurstBucket.create({
                        data: {
                            key,
                            tokens: burstLimit,
                            lastRefillAt: now,
                        },
                    });
                } catch (error) {
                    if (!this.isUniqueConstraintError(error)) {
                        throw error;
                    }
                }
            }

            await tx.$executeRaw`
                SELECT 1
                FROM "GatewayBurstBucket"
                WHERE "key" = ${key}
                FOR UPDATE
            `;

            const lockedBucket = await tx.gatewayBurstBucket.findUnique({
                where: {
                    key,
                },
                select: {
                    key: true,
                    tokens: true,
                    lastRefillAt: true,
                },
            });

            if (lockedBucket) {
                return lockedBucket;
            }
        }

        return {
            key,
            tokens: burstLimit,
            lastRefillAt: now,
        };
    }

    private refillTokens(
        tokens: number,
        lastRefillAt: Date,
        now: Date,
        burstLimit: number,
        refillRatePerSecond: number,
    ): number {
        const elapsedMilliseconds = Math.max(
            0,
            now.getTime() - lastRefillAt.getTime(),
        );

        return Math.min(
            burstLimit,
            tokens + (elapsedMilliseconds / 1000) * refillRatePerSecond,
        );
    }

    private isRetryableTransactionError(error: unknown): boolean {
        const prismaError = error as {
            code?: string;
        };

        return prismaError?.code === 'P2034';
    }

    private isUniqueConstraintError(error: unknown): boolean {
        const prismaError = error as {
            code?: string;
        };

        return prismaError?.code === 'P2002';
    }
}
