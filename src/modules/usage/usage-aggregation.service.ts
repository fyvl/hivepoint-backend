import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type UsageDbClient = Prisma.TransactionClient | PrismaService;

export type UsageRecordWriteInput = {
    subscriptionId: string;
    occurredAt: Date;
    endpoint: string;
    requestCount: number;
    sourceJobId?: string;
};

export type UsageEndpointBreakdownItem = {
    endpoint: string;
    requestCount: number;
};

@Injectable()
export class UsageAggregationService {
    constructor(private readonly prisma: PrismaService) {}

    async recordUsage(input: UsageRecordWriteInput): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await this.recordUsageInTransaction(tx, input);
        });
    }

    async recordUsageInTransaction(
        client: UsageDbClient,
        input: UsageRecordWriteInput,
    ): Promise<void> {
        const bucketDate = this.getUtcDayStart(input.occurredAt);
        const aggregatedAt = new Date();

        await client.usageRecord.create({
            data: {
                subscriptionId: input.subscriptionId,
                occurredAt: input.occurredAt,
                endpoint: input.endpoint,
                requestCount: input.requestCount,
                sourceJobId: input.sourceJobId,
                aggregatedAt,
            },
        });

        await client.usageDailyAggregate.upsert({
            where: {
                subscriptionId_bucketDate: {
                    subscriptionId: input.subscriptionId,
                    bucketDate,
                },
            },
            create: {
                subscriptionId: input.subscriptionId,
                bucketDate,
                requestCount: input.requestCount,
            },
            update: {
                requestCount: {
                    increment: input.requestCount,
                },
            },
        });

        await client.usageEndpointDailyAggregate.upsert({
            where: {
                subscriptionId_bucketDate_endpoint: {
                    subscriptionId: input.subscriptionId,
                    bucketDate,
                    endpoint: input.endpoint,
                },
            },
            create: {
                subscriptionId: input.subscriptionId,
                bucketDate,
                endpoint: input.endpoint,
                requestCount: input.requestCount,
            },
            update: {
                requestCount: {
                    increment: input.requestCount,
                },
            },
        });
    }

    async sumUsageForWindow(
        params: {
            subscriptionId: string;
            periodStart: Date;
            periodEnd: Date;
        },
        client: UsageDbClient = this.prisma,
    ): Promise<number> {
        const { subscriptionId, periodStart, periodEnd } = params;
        if (periodStart >= periodEnd) {
            return 0;
        }

        const fullDaysStart = this.isUtcDayBoundary(periodStart)
            ? new Date(periodStart)
            : this.getNextUtcDayStart(periodStart);
        const fullDaysEnd = this.getUtcDayStart(periodEnd);
        const startPartialEnd =
            fullDaysStart < periodEnd ? fullDaysStart : periodEnd;
        const endPartialStart =
            fullDaysEnd > startPartialEnd ? fullDaysEnd : startPartialEnd;

        let total = 0;

        if (periodStart < startPartialEnd) {
            total += await this.sumRawUsage(client, {
                subscriptionId,
                occurredAt: {
                    gte: periodStart,
                    lt: startPartialEnd,
                },
            });
        }

        if (fullDaysStart < fullDaysEnd) {
            total += await this.sumDailyAggregateUsage(client, {
                subscriptionId,
                bucketDate: {
                    gte: fullDaysStart,
                    lt: fullDaysEnd,
                },
            });

            total += await this.sumRawUsage(client, {
                subscriptionId,
                aggregatedAt: null,
                occurredAt: {
                    gte: fullDaysStart,
                    lt: fullDaysEnd,
                },
            });
        }

        if (endPartialStart < periodEnd) {
            total += await this.sumRawUsage(client, {
                subscriptionId,
                occurredAt: {
                    gte: endPartialStart,
                    lt: periodEnd,
                },
            });
        }

        return total;
    }

    async listEndpointUsageForWindow(
        params: {
            subscriptionId: string;
            periodStart: Date;
            periodEnd: Date;
            limit?: number;
        },
        client: UsageDbClient = this.prisma,
    ): Promise<UsageEndpointBreakdownItem[]> {
        const { subscriptionId, periodStart, periodEnd } = params;
        if (periodStart >= periodEnd) {
            return [];
        }

        const fullDaysStart = this.isUtcDayBoundary(periodStart)
            ? new Date(periodStart)
            : this.getNextUtcDayStart(periodStart);
        const fullDaysEnd = this.getUtcDayStart(periodEnd);
        const startPartialEnd =
            fullDaysStart < periodEnd ? fullDaysStart : periodEnd;
        const endPartialStart =
            fullDaysEnd > startPartialEnd ? fullDaysEnd : startPartialEnd;
        const endpointUsage = new Map<string, number>();

        if (periodStart < startPartialEnd) {
            this.addEndpointUsage(
                endpointUsage,
                await this.groupRawUsageByEndpoint(client, {
                    subscriptionId,
                    occurredAt: {
                        gte: periodStart,
                        lt: startPartialEnd,
                    },
                }),
            );
        }

        if (fullDaysStart < fullDaysEnd) {
            this.addEndpointUsage(
                endpointUsage,
                await this.groupDailyAggregateUsageByEndpoint(client, {
                    subscriptionId,
                    bucketDate: {
                        gte: fullDaysStart,
                        lt: fullDaysEnd,
                    },
                }),
            );

            this.addEndpointUsage(
                endpointUsage,
                await this.groupRawUsageByEndpoint(client, {
                    subscriptionId,
                    aggregatedAt: null,
                    occurredAt: {
                        gte: fullDaysStart,
                        lt: fullDaysEnd,
                    },
                }),
            );
        }

        if (endPartialStart < periodEnd) {
            this.addEndpointUsage(
                endpointUsage,
                await this.groupRawUsageByEndpoint(client, {
                    subscriptionId,
                    occurredAt: {
                        gte: endPartialStart,
                        lt: periodEnd,
                    },
                }),
            );
        }

        return [...endpointUsage.entries()]
            .map(([endpoint, requestCount]) => ({
                endpoint,
                requestCount,
            }))
            .sort(
                (left, right) =>
                    right.requestCount - left.requestCount ||
                    left.endpoint.localeCompare(right.endpoint),
            )
            .slice(0, params.limit ?? 5);
    }

    private async sumRawUsage(
        client: UsageDbClient,
        where: Prisma.UsageRecordWhereInput,
    ): Promise<number> {
        const aggregate = await client.usageRecord.aggregate({
            where,
            _sum: {
                requestCount: true,
            },
        });

        return aggregate._sum.requestCount ?? 0;
    }

    private async sumDailyAggregateUsage(
        client: UsageDbClient,
        where: Prisma.UsageDailyAggregateWhereInput,
    ): Promise<number> {
        const aggregate = await client.usageDailyAggregate.aggregate({
            where,
            _sum: {
                requestCount: true,
            },
        });

        return aggregate._sum.requestCount ?? 0;
    }

    private async groupRawUsageByEndpoint(
        client: UsageDbClient,
        where: Prisma.UsageRecordWhereInput,
    ): Promise<UsageEndpointBreakdownItem[]> {
        const groups = await client.usageRecord.groupBy({
            by: ['endpoint'],
            where,
            _sum: {
                requestCount: true,
            },
        });

        return groups.map((group) => ({
            endpoint: group.endpoint,
            requestCount: group._sum.requestCount ?? 0,
        }));
    }

    private async groupDailyAggregateUsageByEndpoint(
        client: UsageDbClient,
        where: Prisma.UsageEndpointDailyAggregateWhereInput,
    ): Promise<UsageEndpointBreakdownItem[]> {
        const groups = await client.usageEndpointDailyAggregate.groupBy({
            by: ['endpoint'],
            where,
            _sum: {
                requestCount: true,
            },
        });

        return groups.map((group) => ({
            endpoint: group.endpoint,
            requestCount: group._sum.requestCount ?? 0,
        }));
    }

    private addEndpointUsage(
        target: Map<string, number>,
        rows: UsageEndpointBreakdownItem[],
    ): void {
        rows.forEach((row) => {
            target.set(
                row.endpoint,
                (target.get(row.endpoint) ?? 0) + row.requestCount,
            );
        });
    }

    private getUtcDayStart(date: Date): Date {
        const result = new Date(date);
        result.setUTCHours(0, 0, 0, 0);
        return result;
    }

    private getNextUtcDayStart(date: Date): Date {
        const result = this.getUtcDayStart(date);
        result.setUTCDate(result.getUTCDate() + 1);
        return result;
    }

    private isUtcDayBoundary(date: Date): boolean {
        return (
            date.getUTCHours() === 0 &&
            date.getUTCMinutes() === 0 &&
            date.getUTCSeconds() === 0 &&
            date.getUTCMilliseconds() === 0
        );
    }
}
