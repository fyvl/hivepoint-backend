import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import type { Env } from '../../common/config/env.schema';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RecordUsageInput } from './usage.schemas';
import { RecordUsageResponseDto } from './dto/record-usage-response.dto';
import { UsageSummaryResponseDto } from './dto/usage-summary.dto';

@Injectable()
export class UsageService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService<Env, true>,
    ) {}

    async ingestUsage(
        input: RecordUsageInput,
        providedSecret?: string,
    ): Promise<RecordUsageResponseDto> {
        const secret = this.configService.getOrThrow('USAGE_INGEST_SECRET');
        if (!providedSecret || providedSecret !== secret) {
            throw new AppError({
                code: ErrorCodes.USAGE_INGEST_FORBIDDEN,
                message: 'USAGE_INGEST_FORBIDDEN',
                httpStatus: 403,
            });
        }

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

        const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

        await this.prisma.usageRecord.create({
            data: {
                subscriptionId: subscription.id,
                occurredAt,
                endpoint: input.endpoint,
                requestCount: input.requestCount,
            },
        });

        return { ok: true };
    }

    async getSummary(user: AuthenticatedUser): Promise<UsageSummaryResponseDto> {
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
            (subscription) => subscription.currentPeriodStart && subscription.currentPeriodEnd,
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
            grouped.map((row) => [row.subscriptionId, row._sum.requestCount ?? 0]),
        );

        const items = activeWithPeriod.map((subscription) => {
            const usedRequests = usageMap.get(subscription.id) ?? 0;
            const quotaRequests = subscription.plan.quotaRequests;
            const percent = quotaRequests > 0
                ? Math.min(100, Math.floor((usedRequests / quotaRequests) * 100))
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
}
