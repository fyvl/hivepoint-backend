import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import type { Env } from '../../common/config/env.schema';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashApiKey } from '../../common/utils/crypto';
import { AuthorizeUsageResponseDto } from './dto/authorize-usage-response.dto';
import { RecordUsageResponseDto } from './dto/record-usage-response.dto';
import { UsageSummaryResponseDto } from './dto/usage-summary.dto';
import type { AuthorizeUsageInput, RecordUsageInput } from './usage.schemas';

const RATE_LIMIT_WINDOW_SECONDS = 60;

@Injectable()
export class UsageService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService<Env, true>,
    ) {}

    async authorizeUsage(
        input: AuthorizeUsageInput,
        providedSecret?: string,
    ): Promise<AuthorizeUsageResponseDto> {
        this.assertUsageSecret(providedSecret);
        return this.authorizeUsageInternal(input);
    }

    async authorizeGatewayUsage(
        input: AuthorizeUsageInput,
    ): Promise<AuthorizeUsageResponseDto> {
        return this.authorizeUsageInternal(input);
    }

    async recordAuthorizedUsage(input: RecordUsageInput): Promise<void> {
        await this.createUsageRecord(input);
    }

    async ingestUsage(
        input: RecordUsageInput,
        providedSecret?: string,
    ): Promise<RecordUsageResponseDto> {
        this.assertUsageSecret(providedSecret);
        await this.createUsageRecord(input);

        return { ok: true };
    }

    async getSummary(
        user: AuthenticatedUser,
    ): Promise<UsageSummaryResponseDto> {
        const occurredAt = new Date();
        const subscriptions = await this.prisma.subscription.findMany({
            where: {
                userId: user.id,
                status: {
                    in: [
                        SubscriptionStatus.ACTIVE,
                        SubscriptionStatus.PAST_DUE,
                    ],
                },
            },
            select: {
                id: true,
                status: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                gracePeriodEndsAt: true,
                plan: {
                    select: {
                        id: true,
                        name: true,
                        quotaRequests: true,
                        rateLimitRpm: true,
                        product: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                    },
                },
            },
        });

        const activeWithPeriod = subscriptions.filter(
            (subscription) =>
                this.getUsageWindow(subscription, occurredAt) !== null,
        );

        if (activeWithPeriod.length === 0) {
            return { items: [] };
        }

        const orFilters = activeWithPeriod.flatMap((subscription) => {
            const usageWindow = this.getUsageWindow(subscription, occurredAt);
            if (!usageWindow) {
                return [];
            }

            return [
                {
                    subscriptionId: subscription.id,
                    occurredAt: usageWindow,
                },
            ];
        });

        const grouped = await this.prisma.usageRecord.groupBy({
            by: ['subscriptionId'],
            where: {
                OR: orFilters,
            },
            _sum: {
                requestCount: true,
            },
        });

        const usageMap = new Map(
            grouped.map((row) => [
                row.subscriptionId,
                row._sum.requestCount ?? 0,
            ]),
        );

        const items = activeWithPeriod.map((subscription) => {
            const usageWindow = this.getUsageWindow(subscription, occurredAt);
            const usedRequests = usageMap.get(subscription.id) ?? 0;
            const quotaRequests = subscription.plan.quotaRequests;
            const percent =
                quotaRequests > 0
                    ? Math.min(
                          100,
                          Math.floor((usedRequests / quotaRequests) * 100),
                      )
                    : 0;

            return {
                subscriptionId: subscription.id,
                status: subscription.status,
                periodStart: usageWindow?.gte as Date,
                periodEnd: usageWindow?.lt as Date,
                gracePeriodEndsAt: subscription.gracePeriodEndsAt,
                usedRequests,
                quotaRequests,
                percent,
                plan: {
                    id: subscription.plan.id,
                    name: subscription.plan.name,
                    quotaRequests: subscription.plan.quotaRequests,
                    rateLimitRpm: subscription.plan.rateLimitRpm,
                },
                product: {
                    id: subscription.plan.product.id,
                    title: subscription.plan.product.title,
                },
            };
        });

        return { items };
    }

    private async authorizeUsageInternal(
        input: AuthorizeUsageInput,
    ): Promise<AuthorizeUsageResponseDto> {
        const product = await this.prisma.apiProduct.findUnique({
            where: { id: input.productId },
            select: {
                id: true,
                title: true,
            },
        });

        if (!product) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_FOUND,
                message: 'PRODUCT_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const apiKey = await this.prisma.apiKey.findFirst({
            where: {
                keyHash: this.hashIncomingApiKey(input.apiKey),
                isActive: true,
                revokedAt: null,
            },
            select: {
                id: true,
                userId: true,
            },
        });

        if (!apiKey) {
            return {
                allowed: false,
                reason: 'INVALID_API_KEY',
                product,
                requestedRequests: input.requestCount,
                usageRecorded: false,
            };
        }

        const occurredAt = input.occurredAt
            ? new Date(input.occurredAt)
            : new Date();
        const subscription = await this.prisma.subscription.findFirst({
            where: {
                userId: apiKey.userId,
                plan: {
                    productId: input.productId,
                },
                OR: [
                    {
                        status: SubscriptionStatus.ACTIVE,
                        currentPeriodStart: {
                            lte: occurredAt,
                        },
                        currentPeriodEnd: {
                            gt: occurredAt,
                        },
                    },
                    {
                        status: SubscriptionStatus.PAST_DUE,
                        currentPeriodStart: {
                            lte: occurredAt,
                        },
                        gracePeriodEndsAt: {
                            gt: occurredAt,
                        },
                    },
                ],
            },
            orderBy: [
                {
                    gracePeriodEndsAt: 'desc',
                },
                {
                    currentPeriodEnd: 'desc',
                },
                {
                    createdAt: 'desc',
                },
            ],
            select: {
                id: true,
                userId: true,
                status: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                gracePeriodEndsAt: true,
                plan: {
                    select: {
                        id: true,
                        name: true,
                        quotaRequests: true,
                        rateLimitRpm: true,
                        product: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                    },
                },
            },
        });

        if (!subscription || !this.getUsageWindow(subscription, occurredAt)) {
            return {
                allowed: false,
                reason: 'NO_ACTIVE_SUBSCRIPTION',
                apiKeyId: apiKey.id,
                userId: apiKey.userId,
                product,
                requestedRequests: input.requestCount,
                usageRecorded: false,
            };
        }

        const shouldConsume = input.consume ?? false;
        if (shouldConsume) {
            return this.authorizeUsageWithConsumption({
                apiKeyId: apiKey.id,
                userId: apiKey.userId,
                productId: input.productId,
                endpoint: input.endpoint,
                requestCount: input.requestCount,
                occurredAt,
            });
        }

        const usageWindow = this.getUsageWindow(subscription, occurredAt);
        if (!usageWindow) {
            return {
                allowed: false,
                reason: 'NO_ACTIVE_SUBSCRIPTION',
                apiKeyId: apiKey.id,
                userId: apiKey.userId,
                product,
                requestedRequests: input.requestCount,
                usageRecorded: false,
            };
        }

        const usageAggregate = await this.prisma.usageRecord.aggregate({
            where: {
                subscriptionId: subscription.id,
                occurredAt: {
                    gte: usageWindow.gte,
                    lt: usageWindow.lt,
                },
            },
            _sum: {
                requestCount: true,
            },
        });

        const usedRequests = usageAggregate._sum.requestCount ?? 0;
        const quotaRequests = subscription.plan.quotaRequests;
        const requestedRequests = input.requestCount;
        const nextUsedRequests = usedRequests + requestedRequests;
        const rateLimitRpm = subscription.plan.rateLimitRpm ?? null;
        let remainingRateLimitRequests: number | null = null;

        if (nextUsedRequests > quotaRequests) {
            return {
                allowed: false,
                reason: 'QUOTA_EXCEEDED',
                apiKeyId: apiKey.id,
                subscriptionId: subscription.id,
                userId: subscription.userId,
                periodStart: usageWindow.gte,
                periodEnd: usageWindow.lt,
                usedRequests,
                requestedRequests,
                quotaRequests,
                remainingRequests: Math.max(0, quotaRequests - usedRequests),
                rateLimitRpm,
                remainingRateLimitRequests,
                usageRecorded: false,
                plan: {
                    id: subscription.plan.id,
                    name: subscription.plan.name,
                    quotaRequests: subscription.plan.quotaRequests,
                    rateLimitRpm: subscription.plan.rateLimitRpm,
                },
                product: subscription.plan.product,
            };
        }

        if (typeof rateLimitRpm === 'number') {
            const rateLimitUsageAggregate = await this.prisma.usageRecord.aggregate({
                where: {
                    subscriptionId: subscription.id,
                    occurredAt: {
                        gte: this.getRateLimitWindowStart(
                            occurredAt,
                            usageWindow.gte,
                        ),
                        lte: occurredAt,
                    },
                },
                _sum: {
                    requestCount: true,
                },
            });

            const usedRateLimitRequests =
                rateLimitUsageAggregate._sum.requestCount ?? 0;
            remainingRateLimitRequests = Math.max(
                0,
                rateLimitRpm - usedRateLimitRequests,
            );

            if (usedRateLimitRequests + requestedRequests > rateLimitRpm) {
                return {
                    allowed: false,
                    reason: 'RATE_LIMIT_EXCEEDED',
                    apiKeyId: apiKey.id,
                    subscriptionId: subscription.id,
                    userId: subscription.userId,
                    periodStart: usageWindow.gte,
                    periodEnd: usageWindow.lt,
                    usedRequests,
                    requestedRequests,
                    quotaRequests,
                    remainingRequests: Math.max(
                        0,
                        quotaRequests - usedRequests,
                    ),
                    rateLimitRpm,
                    remainingRateLimitRequests,
                    usageRecorded: false,
                    plan: {
                        id: subscription.plan.id,
                        name: subscription.plan.name,
                        quotaRequests: subscription.plan.quotaRequests,
                        rateLimitRpm: subscription.plan.rateLimitRpm,
                    },
                    product: subscription.plan.product,
                };
            }
        }

        return {
            allowed: true,
            apiKeyId: apiKey.id,
            subscriptionId: subscription.id,
            userId: subscription.userId,
            periodStart: usageWindow.gte,
            periodEnd: usageWindow.lt,
            usedRequests,
            requestedRequests,
            quotaRequests,
            remainingRequests: Math.max(0, quotaRequests - usedRequests),
            rateLimitRpm,
            remainingRateLimitRequests,
            usageRecorded: false,
            plan: {
                id: subscription.plan.id,
                name: subscription.plan.name,
                quotaRequests: subscription.plan.quotaRequests,
                rateLimitRpm: subscription.plan.rateLimitRpm,
            },
            product: subscription.plan.product,
        };
    }

    private async authorizeUsageWithConsumption(params: {
        apiKeyId: string;
        userId: string;
        productId: string;
        endpoint: string;
        requestCount: number;
        occurredAt: Date;
    }): Promise<AuthorizeUsageResponseDto> {
        return this.prisma.$transaction(async (tx) => {
            const subscription = await tx.subscription.findFirst({
                where: {
                    userId: params.userId,
                    plan: {
                        productId: params.productId,
                    },
                    OR: [
                        {
                            status: SubscriptionStatus.ACTIVE,
                            currentPeriodStart: {
                                lte: params.occurredAt,
                            },
                            currentPeriodEnd: {
                                gt: params.occurredAt,
                            },
                        },
                        {
                            status: SubscriptionStatus.PAST_DUE,
                            currentPeriodStart: {
                                lte: params.occurredAt,
                            },
                            gracePeriodEndsAt: {
                                gt: params.occurredAt,
                            },
                        },
                    ],
                },
                orderBy: [
                    {
                        gracePeriodEndsAt: 'desc',
                    },
                    {
                        currentPeriodEnd: 'desc',
                    },
                    {
                        createdAt: 'desc',
                    },
                ],
                select: {
                    id: true,
                    userId: true,
                    status: true,
                    currentPeriodStart: true,
                    currentPeriodEnd: true,
                    gracePeriodEndsAt: true,
                    plan: {
                        select: {
                            id: true,
                            name: true,
                            quotaRequests: true,
                            rateLimitRpm: true,
                            product: {
                                select: {
                                    id: true,
                                    title: true,
                                },
                            },
                        },
                    },
                },
            });

            if (
                !subscription ||
                !this.getUsageWindow(subscription, params.occurredAt)
            ) {
                return {
                    allowed: false,
                    reason: 'NO_ACTIVE_SUBSCRIPTION',
                    apiKeyId: params.apiKeyId,
                    userId: params.userId,
                    requestedRequests: params.requestCount,
                    usageRecorded: false,
                };
            }

            await tx.$executeRaw`
                SELECT 1
                FROM "Subscription"
                WHERE "id" = ${subscription.id}
                FOR UPDATE
            `;

            const usageWindow = this.getUsageWindow(
                subscription,
                params.occurredAt,
            );
            if (!usageWindow) {
                return {
                    allowed: false,
                    reason: 'NO_ACTIVE_SUBSCRIPTION',
                    apiKeyId: params.apiKeyId,
                    userId: params.userId,
                    requestedRequests: params.requestCount,
                    usageRecorded: false,
                };
            }

            const usageAggregate = await tx.usageRecord.aggregate({
                where: {
                    subscriptionId: subscription.id,
                    occurredAt: {
                        gte: usageWindow.gte,
                        lt: usageWindow.lt,
                    },
                },
                _sum: {
                    requestCount: true,
                },
            });

            const usedRequests = usageAggregate._sum.requestCount ?? 0;
            const quotaRequests = subscription.plan.quotaRequests;
            const nextUsedRequests = usedRequests + params.requestCount;
            const rateLimitRpm = subscription.plan.rateLimitRpm ?? null;
            let remainingRateLimitRequests: number | null = null;

            if (nextUsedRequests > quotaRequests) {
                return {
                    allowed: false,
                    reason: 'QUOTA_EXCEEDED',
                    apiKeyId: params.apiKeyId,
                    subscriptionId: subscription.id,
                    userId: subscription.userId,
                    periodStart: usageWindow.gte,
                    periodEnd: usageWindow.lt,
                    usedRequests,
                    requestedRequests: params.requestCount,
                    quotaRequests,
                    remainingRequests: Math.max(
                        0,
                        quotaRequests - usedRequests,
                    ),
                    rateLimitRpm,
                    remainingRateLimitRequests,
                    usageRecorded: false,
                    plan: {
                        id: subscription.plan.id,
                        name: subscription.plan.name,
                        quotaRequests: subscription.plan.quotaRequests,
                        rateLimitRpm: subscription.plan.rateLimitRpm,
                    },
                    product: subscription.plan.product,
                };
            }

            if (typeof rateLimitRpm === 'number') {
                const rateLimitUsageAggregate = await tx.usageRecord.aggregate({
                    where: {
                        subscriptionId: subscription.id,
                        occurredAt: {
                            gte: this.getRateLimitWindowStart(
                                params.occurredAt,
                                usageWindow.gte,
                            ),
                            lte: params.occurredAt,
                        },
                    },
                    _sum: {
                        requestCount: true,
                    },
                });

                const usedRateLimitRequests =
                    rateLimitUsageAggregate._sum.requestCount ?? 0;
                remainingRateLimitRequests = Math.max(
                    0,
                    rateLimitRpm - usedRateLimitRequests,
                );

                if (
                    usedRateLimitRequests + params.requestCount >
                    rateLimitRpm
                ) {
                    return {
                        allowed: false,
                        reason: 'RATE_LIMIT_EXCEEDED',
                        apiKeyId: params.apiKeyId,
                        subscriptionId: subscription.id,
                        userId: subscription.userId,
                        periodStart: usageWindow.gte,
                        periodEnd: usageWindow.lt,
                        usedRequests,
                        requestedRequests: params.requestCount,
                        quotaRequests,
                        remainingRequests: Math.max(
                            0,
                            quotaRequests - usedRequests,
                        ),
                        rateLimitRpm,
                        remainingRateLimitRequests,
                        usageRecorded: false,
                        plan: {
                            id: subscription.plan.id,
                            name: subscription.plan.name,
                            quotaRequests: subscription.plan.quotaRequests,
                            rateLimitRpm: subscription.plan.rateLimitRpm,
                        },
                        product: subscription.plan.product,
                    };
                }

                remainingRateLimitRequests = Math.max(
                    0,
                    rateLimitRpm - usedRateLimitRequests - params.requestCount,
                );
            }

            await tx.usageRecord.create({
                data: {
                    subscriptionId: subscription.id,
                    occurredAt: params.occurredAt,
                    endpoint: params.endpoint,
                    requestCount: params.requestCount,
                },
            });

            return {
                allowed: true,
                apiKeyId: params.apiKeyId,
                subscriptionId: subscription.id,
                userId: subscription.userId,
                periodStart: usageWindow.gte,
                periodEnd: usageWindow.lt,
                usedRequests: nextUsedRequests,
                requestedRequests: params.requestCount,
                quotaRequests,
                remainingRequests: Math.max(
                    0,
                    quotaRequests - nextUsedRequests,
                ),
                rateLimitRpm,
                remainingRateLimitRequests,
                usageRecorded: true,
                plan: {
                    id: subscription.plan.id,
                    name: subscription.plan.name,
                    quotaRequests: subscription.plan.quotaRequests,
                    rateLimitRpm: subscription.plan.rateLimitRpm,
                },
                product: subscription.plan.product,
            };
        });
    }

    private getRateLimitWindowStart(
        occurredAt: Date,
        periodStart: Date,
    ): Date {
        const rateLimitWindowStart = new Date(
            occurredAt.getTime() - RATE_LIMIT_WINDOW_SECONDS * 1000,
        );

        return rateLimitWindowStart > periodStart
            ? rateLimitWindowStart
            : periodStart;
    }

    private getUsageWindow(
        subscription: {
            status: SubscriptionStatus;
            currentPeriodStart: Date | null;
            currentPeriodEnd?: Date | null;
            gracePeriodEndsAt?: Date | null;
        },
        occurredAt: Date,
    ): { gte: Date; lt: Date } | null {
        const { currentPeriodStart } = subscription;
        if (!currentPeriodStart || currentPeriodStart > occurredAt) {
            return null;
        }

        if (subscription.status === SubscriptionStatus.PAST_DUE) {
            const gracePeriodEndsAt = subscription.gracePeriodEndsAt ?? null;
            if (!gracePeriodEndsAt || gracePeriodEndsAt <= occurredAt) {
                return null;
            }

            return {
                gte: currentPeriodStart,
                lt: gracePeriodEndsAt,
            };
        }

        if (
            !subscription.currentPeriodEnd ||
            subscription.currentPeriodEnd <= occurredAt
        ) {
            return null;
        }

        return {
            gte: currentPeriodStart,
            lt: subscription.currentPeriodEnd,
        };
    }

    private async createUsageRecord(input: RecordUsageInput): Promise<void> {
        const subscription = await this.prisma.subscription.findUnique({
            where: { id: input.subscriptionId },
            select: {
                id: true,
                status: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                gracePeriodEndsAt: true,
            },
        });

        if (!subscription) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_FOUND,
                message: 'SUBSCRIPTION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const occurredAt = input.occurredAt
            ? new Date(input.occurredAt)
            : new Date();

        if (!this.getUsageWindow(subscription, occurredAt)) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_ACTIVE,
                message: 'SUBSCRIPTION_NOT_ACTIVE',
                httpStatus: 400,
            });
        }

        await this.prisma.usageRecord.create({
            data: {
                subscriptionId: subscription.id,
                occurredAt,
                endpoint: input.endpoint,
                requestCount: input.requestCount,
            },
        });
    }

    private assertUsageSecret(providedSecret?: string): void {
        const secret = this.configService.getOrThrow<string>(
            'USAGE_INGEST_SECRET',
        );
        if (!providedSecret || providedSecret !== secret) {
            throw new AppError({
                code: ErrorCodes.USAGE_INGEST_FORBIDDEN,
                message: 'USAGE_INGEST_FORBIDDEN',
                httpStatus: 403,
            });
        }
    }

    private hashIncomingApiKey(rawKey: string): string {
        const salt = this.configService.getOrThrow<string>('API_KEY_SALT');
        return hashApiKey(rawKey, salt);
    }
}
