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
        const subscriptions = await this.prisma.subscription.findMany({
            where: {
                userId: user.id,
                status: SubscriptionStatus.ACTIVE,
            },
            select: {
                id: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                plan: {
                    select: {
                        id: true,
                        name: true,
                        quotaRequests: true,
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
                subscription.currentPeriodStart &&
                subscription.currentPeriodEnd,
        );

        if (activeWithPeriod.length === 0) {
            return { items: [] };
        }

        const orFilters = activeWithPeriod.map((subscription) => ({
            subscriptionId: subscription.id,
            occurredAt: {
                gte: subscription.currentPeriodStart as Date,
                lt: subscription.currentPeriodEnd as Date,
            },
        }));

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
                periodStart: subscription.currentPeriodStart as Date,
                periodEnd: subscription.currentPeriodEnd as Date,
                usedRequests,
                quotaRequests,
                percent,
                plan: {
                    id: subscription.plan.id,
                    name: subscription.plan.name,
                    quotaRequests: subscription.plan.quotaRequests,
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
                status: SubscriptionStatus.ACTIVE,
                currentPeriodStart: {
                    lte: occurredAt,
                },
                currentPeriodEnd: {
                    gt: occurredAt,
                },
                plan: {
                    productId: input.productId,
                },
            },
            select: {
                id: true,
                userId: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                plan: {
                    select: {
                        id: true,
                        name: true,
                        quotaRequests: true,
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
            !subscription.currentPeriodStart ||
            !subscription.currentPeriodEnd
        ) {
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

        const usageAggregate = await this.prisma.usageRecord.aggregate({
            where: {
                subscriptionId: subscription.id,
                occurredAt: {
                    gte: subscription.currentPeriodStart,
                    lt: subscription.currentPeriodEnd,
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

        if (nextUsedRequests > quotaRequests) {
            return {
                allowed: false,
                reason: 'QUOTA_EXCEEDED',
                apiKeyId: apiKey.id,
                subscriptionId: subscription.id,
                userId: subscription.userId,
                periodStart: subscription.currentPeriodStart,
                periodEnd: subscription.currentPeriodEnd,
                usedRequests,
                requestedRequests,
                quotaRequests,
                remainingRequests: Math.max(0, quotaRequests - usedRequests),
                usageRecorded: false,
                plan: {
                    id: subscription.plan.id,
                    name: subscription.plan.name,
                    quotaRequests: subscription.plan.quotaRequests,
                },
                product: subscription.plan.product,
            };
        }

        return {
            allowed: true,
            apiKeyId: apiKey.id,
            subscriptionId: subscription.id,
            userId: subscription.userId,
            periodStart: subscription.currentPeriodStart,
            periodEnd: subscription.currentPeriodEnd,
            usedRequests,
            requestedRequests,
            quotaRequests,
            remainingRequests: Math.max(0, quotaRequests - usedRequests),
            usageRecorded: false,
            plan: {
                id: subscription.plan.id,
                name: subscription.plan.name,
                quotaRequests: subscription.plan.quotaRequests,
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
                    status: SubscriptionStatus.ACTIVE,
                    currentPeriodStart: {
                        lte: params.occurredAt,
                    },
                    currentPeriodEnd: {
                        gt: params.occurredAt,
                    },
                    plan: {
                        productId: params.productId,
                    },
                },
                select: {
                    id: true,
                    userId: true,
                    currentPeriodStart: true,
                    currentPeriodEnd: true,
                    plan: {
                        select: {
                            id: true,
                            name: true,
                            quotaRequests: true,
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
                !subscription.currentPeriodStart ||
                !subscription.currentPeriodEnd
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

            const usageAggregate = await tx.usageRecord.aggregate({
                where: {
                    subscriptionId: subscription.id,
                    occurredAt: {
                        gte: subscription.currentPeriodStart,
                        lt: subscription.currentPeriodEnd,
                    },
                },
                _sum: {
                    requestCount: true,
                },
            });

            const usedRequests = usageAggregate._sum.requestCount ?? 0;
            const quotaRequests = subscription.plan.quotaRequests;
            const nextUsedRequests = usedRequests + params.requestCount;

            if (nextUsedRequests > quotaRequests) {
                return {
                    allowed: false,
                    reason: 'QUOTA_EXCEEDED',
                    apiKeyId: params.apiKeyId,
                    subscriptionId: subscription.id,
                    userId: subscription.userId,
                    periodStart: subscription.currentPeriodStart,
                    periodEnd: subscription.currentPeriodEnd,
                    usedRequests,
                    requestedRequests: params.requestCount,
                    quotaRequests,
                    remainingRequests: Math.max(
                        0,
                        quotaRequests - usedRequests,
                    ),
                    usageRecorded: false,
                    plan: {
                        id: subscription.plan.id,
                        name: subscription.plan.name,
                        quotaRequests: subscription.plan.quotaRequests,
                    },
                    product: subscription.plan.product,
                };
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
                periodStart: subscription.currentPeriodStart,
                periodEnd: subscription.currentPeriodEnd,
                usedRequests: nextUsedRequests,
                requestedRequests: params.requestCount,
                quotaRequests,
                remainingRequests: Math.max(
                    0,
                    quotaRequests - nextUsedRequests,
                ),
                usageRecorded: true,
                plan: {
                    id: subscription.plan.id,
                    name: subscription.plan.name,
                    quotaRequests: subscription.plan.quotaRequests,
                },
                product: subscription.plan.product,
            };
        });
    }

    private async createUsageRecord(input: RecordUsageInput): Promise<void> {
        const subscription = await this.prisma.subscription.findUnique({
            where: { id: input.subscriptionId },
            select: {
                id: true,
                status: true,
            },
        });

        if (!subscription) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_FOUND,
                message: 'SUBSCRIPTION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (subscription.status !== SubscriptionStatus.ACTIVE) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_ACTIVE,
                message: 'SUBSCRIPTION_NOT_ACTIVE',
                httpStatus: 400,
            });
        }

        const occurredAt = input.occurredAt
            ? new Date(input.occurredAt)
            : new Date();

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
