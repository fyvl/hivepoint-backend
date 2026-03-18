import { Injectable } from '@nestjs/common';
import {
    InvoiceStatus,
    ProductStatus,
    Role,
    SubscriptionStatus,
    VersionStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SellerAnalyticsOverviewResponseDto } from './dto/seller-analytics-overview.dto';

const ANALYTICS_WINDOW_DAYS = 30;

@Injectable()
export class AnalyticsService {
    constructor(private readonly prisma: PrismaService) {}

    async getSellerOverview(
        user: AuthenticatedUser,
    ): Promise<SellerAnalyticsOverviewResponseDto> {
        const windowStart = new Date();
        windowStart.setUTCDate(windowStart.getUTCDate() - ANALYTICS_WINDOW_DAYS);

        const products = await this.prisma.apiProduct.findMany({
            where:
                user.role === Role.ADMIN
                    ? undefined
                    : {
                          ownerId: user.id,
                      },
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                title: true,
                status: true,
                plans: {
                    select: {
                        id: true,
                    },
                },
                versions: {
                    where: {
                        status: VersionStatus.PUBLISHED,
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 1,
                    select: {
                        id: true,
                        version: true,
                        createdAt: true,
                    },
                },
            },
        });

        if (products.length === 0) {
            return {
                windowDays: ANALYTICS_WINDOW_DAYS,
                totals: {
                    productCount: 0,
                    publishedProductCount: 0,
                    views30d: 0,
                    subscriptions30d: 0,
                    activeClients: 0,
                    pastDueClients: 0,
                    failedPayments30d: 0,
                    requests30d: 0,
                    mrrCents: 0,
                },
                products: [],
            };
        }

        const productIds = products.map((product) => product.id);
        const planIdToProductId = new Map<string, string>();
        products.forEach((product) => {
            product.plans.forEach((plan) => {
                planIdToProductId.set(plan.id, product.id);
            });
        });
        const planIds = [...planIdToProductId.keys()];

        const [viewCounts, subscriptions, failedInvoices, usageRecords] =
            await Promise.all([
                this.prisma.productView.groupBy({
                    by: ['productId'],
                    where: {
                        productId: {
                            in: productIds,
                        },
                        viewedAt: {
                            gte: windowStart,
                        },
                    },
                    _count: {
                        _all: true,
                    },
                }),
                this.prisma.subscription.findMany({
                    where: {
                        planId: {
                            in: planIds,
                        },
                    },
                    select: {
                        id: true,
                        userId: true,
                        status: true,
                        createdAt: true,
                        planId: true,
                        plan: {
                            select: {
                                priceCents: true,
                            },
                        },
                    },
                }),
                this.prisma.invoice.findMany({
                    where: {
                        createdAt: {
                            gte: windowStart,
                        },
                        status: {
                            in: [InvoiceStatus.PAST_DUE, InvoiceStatus.VOID],
                        },
                        subscription: {
                            planId: {
                                in: planIds,
                            },
                        },
                    },
                    select: {
                        subscription: {
                            select: {
                                planId: true,
                            },
                        },
                    },
                }),
                this.prisma.usageRecord.findMany({
                    where: {
                        occurredAt: {
                            gte: windowStart,
                        },
                        subscription: {
                            planId: {
                                in: planIds,
                            },
                        },
                    },
                    select: {
                        endpoint: true,
                        requestCount: true,
                        subscription: {
                            select: {
                                planId: true,
                            },
                        },
                    },
                }),
            ]);

        const viewsByProductId = new Map<string, number>(
            viewCounts.map((row) => [row.productId, row._count._all]),
        );
        const subscriptions30dByProductId = new Map<string, number>();
        const activeClientsByProductId = new Map<string, Set<string>>();
        const pastDueClientsByProductId = new Map<string, Set<string>>();
        const failedPaymentsByProductId = new Map<string, number>();
        const requestsByProductId = new Map<string, number>();
        const topEndpointsByProductId = new Map<
            string,
            Map<string, number>
        >();

        let activeMrrCents = 0;

        subscriptions.forEach((subscription): void => {
            const productId = planIdToProductId.get(subscription.planId);
            if (!productId) {
                return;
            }

            if (subscription.createdAt >= windowStart) {
                subscriptions30dByProductId.set(
                    productId,
                    (subscriptions30dByProductId.get(productId) ?? 0) + 1,
                );
            }

            if (subscription.status === SubscriptionStatus.ACTIVE) {
                activeMrrCents += subscription.plan.priceCents;
            }

            if (
                subscription.status === SubscriptionStatus.ACTIVE ||
                subscription.status === SubscriptionStatus.PAST_DUE
            ) {
                if (!activeClientsByProductId.has(productId)) {
                    activeClientsByProductId.set(productId, new Set());
                }
                activeClientsByProductId.get(productId)?.add(subscription.userId);
            }

            if (subscription.status === SubscriptionStatus.PAST_DUE) {
                if (!pastDueClientsByProductId.has(productId)) {
                    pastDueClientsByProductId.set(productId, new Set());
                }
                pastDueClientsByProductId
                    .get(productId)
                    ?.add(subscription.userId);
            }
        });

        failedInvoices.forEach((invoice): void => {
            const productId = planIdToProductId.get(invoice.subscription.planId);
            if (!productId) {
                return;
            }

            failedPaymentsByProductId.set(
                productId,
                (failedPaymentsByProductId.get(productId) ?? 0) + 1,
            );
        });

        usageRecords.forEach((record): void => {
            const productId = planIdToProductId.get(record.subscription.planId);
            if (!productId) {
                return;
            }

            requestsByProductId.set(
                productId,
                (requestsByProductId.get(productId) ?? 0) + record.requestCount,
            );

            if (!topEndpointsByProductId.has(productId)) {
                topEndpointsByProductId.set(productId, new Map());
            }

            const endpointMap = topEndpointsByProductId.get(productId);
            endpointMap?.set(
                record.endpoint,
                (endpointMap.get(record.endpoint) ?? 0) + record.requestCount,
            );
        });

        const items = products.map((product) => {
            const views30d = viewsByProductId.get(product.id) ?? 0;
            const subscriptions30d =
                subscriptions30dByProductId.get(product.id) ?? 0;
            const activeClients =
                activeClientsByProductId.get(product.id)?.size ?? 0;
            const pastDueClients =
                pastDueClientsByProductId.get(product.id)?.size ?? 0;
            const failedPayments30d =
                failedPaymentsByProductId.get(product.id) ?? 0;
            const requests30d = requestsByProductId.get(product.id) ?? 0;
            const conversionRate30d =
                views30d > 0
                    ? Number(
                          ((subscriptions30d / views30d) * 100).toFixed(1),
                      )
                    : 0;
            const topEndpoints = [
                ...(topEndpointsByProductId.get(product.id)?.entries() ?? []),
            ]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([endpoint, requestCount]) => ({
                    endpoint,
                    requestCount,
                }));

            return {
                productId: product.id,
                title: product.title,
                status: product.status,
                views30d,
                subscriptions30d,
                conversionRate30d,
                activeClients,
                pastDueClients,
                failedPayments30d,
                requests30d,
                latestPublishedVersion: product.versions[0] ?? null,
                topEndpoints,
            };
        });

        const totals = items.reduce(
            (acc, item) => {
                acc.views30d += item.views30d;
                acc.subscriptions30d += item.subscriptions30d;
                acc.activeClients += item.activeClients;
                acc.pastDueClients += item.pastDueClients;
                acc.failedPayments30d += item.failedPayments30d;
                acc.requests30d += item.requests30d;
                return acc;
            },
            {
                productCount: products.length,
                publishedProductCount: products.filter(
                    (product) => product.status === ProductStatus.PUBLISHED,
                ).length,
                views30d: 0,
                subscriptions30d: 0,
                activeClients: 0,
                pastDueClients: 0,
                failedPayments30d: 0,
                requests30d: 0,
                mrrCents: activeMrrCents,
            },
        );

        return {
            windowDays: ANALYTICS_WINDOW_DAYS,
            totals,
            products: items.sort((a, b) => b.requests30d - a.requests30d),
        };
    }
}
