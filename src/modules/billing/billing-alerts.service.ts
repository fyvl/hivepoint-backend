import { Injectable } from '@nestjs/common';
import { VersionStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
import {
    BillingAlertDto,
    BillingAlertKind,
    BillingAlertsResponseDto,
    BillingAlertSeverity,
} from './dto/billing-alert.dto';
import { SubscriptionsService } from './subscriptions.service';

const RENEWAL_ALERT_WINDOW_DAYS = 7;

@Injectable()
export class BillingAlertsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly subscriptionsService: SubscriptionsService,
        private readonly usageService: UsageService,
    ) {}

    async listAlerts(
        user: AuthenticatedUser,
    ): Promise<BillingAlertsResponseDto> {
        const [subscriptionResponse, usageSummary] = await Promise.all([
            this.subscriptionsService.listUserSubscriptions(user),
            this.usageService.getSummary(user),
        ]);

        const subscriptions = subscriptionResponse.items;
        const now = new Date();
        const renewalCutoff = new Date(now);
        renewalCutoff.setUTCDate(
            renewalCutoff.getUTCDate() + RENEWAL_ALERT_WINDOW_DAYS,
        );

        const latestVersions = await this.getLatestPublishedVersions(
            subscriptions.map((subscription) => subscription.product.id),
        );

        const alerts: BillingAlertDto[] = [];

        subscriptions.forEach((subscription) => {
            const productTitle = subscription.product.title;
            const planName = subscription.plan.name;
            const latestInvoice = subscription.latestInvoice;
            const effectiveRetryAt =
                latestInvoice?.managedNextRetryAt ??
                latestInvoice?.nextPaymentAttemptAt ??
                null;

            if (subscription.status === 'PAST_DUE') {
                alerts.push({
                    kind: BillingAlertKind.PAYMENT_PAST_DUE,
                    severity: BillingAlertSeverity.DANGER,
                    subscriptionId: subscription.id,
                    productId: subscription.product.id,
                    invoiceId: latestInvoice?.id ?? null,
                    versionId: null,
                    title: `Payment past due for ${productTitle}`,
                    message: this.buildPastDueMessage({
                        planName,
                        gracePeriodEndsAt: subscription.gracePeriodEndsAt,
                        retryExhaustedAt:
                            latestInvoice?.managedRetryExhaustedAt ?? null,
                    }),
                    actionLabel: 'Open billing',
                    actionUrl: '/billing',
                    effectiveAt:
                        effectiveRetryAt ??
                        subscription.gracePeriodEndsAt ??
                        subscription.updatedAt,
                });
            }

            if (latestInvoice && effectiveRetryAt) {
                alerts.push({
                    kind: BillingAlertKind.PAYMENT_RETRY_SCHEDULED,
                    severity: BillingAlertSeverity.WARNING,
                    subscriptionId: subscription.id,
                    productId: subscription.product.id,
                    invoiceId: latestInvoice.id,
                    versionId: null,
                    title: `Retry scheduled for ${productTitle}`,
                    message: latestInvoice?.managedNextRetryAt
                        ? `Hivepoint will retry the ${planName} renewal on ${effectiveRetryAt.toISOString()}.`
                        : `Stripe will retry the ${planName} renewal on ${effectiveRetryAt.toISOString()}.`,
                    actionLabel: 'Open billing',
                    actionUrl: '/billing',
                    effectiveAt: effectiveRetryAt,
                });
            }

            if (
                subscription.status === 'ACTIVE' &&
                !subscription.cancelAtPeriodEnd &&
                subscription.currentPeriodEnd &&
                subscription.currentPeriodEnd >= now &&
                subscription.currentPeriodEnd <= renewalCutoff
            ) {
                alerts.push({
                    kind: BillingAlertKind.UPCOMING_RENEWAL,
                    severity: BillingAlertSeverity.INFO,
                    subscriptionId: subscription.id,
                    productId: subscription.product.id,
                    invoiceId: null,
                    versionId: null,
                    title: `Renewal coming up for ${productTitle}`,
                    message: `${planName} renews on ${subscription.currentPeriodEnd.toISOString()}.`,
                    actionLabel: 'Review billing',
                    actionUrl: '/billing',
                    effectiveAt: subscription.currentPeriodEnd,
                });
            }

            const latestVersion = latestVersions.get(subscription.product.id);
            const versionBaseline =
                subscription.currentPeriodStart ??
                subscription.createdAt ??
                null;
            if (
                latestVersion &&
                versionBaseline &&
                latestVersion.createdAt > versionBaseline
            ) {
                alerts.push({
                    kind: BillingAlertKind.NEW_VERSION_AVAILABLE,
                    severity: BillingAlertSeverity.INFO,
                    subscriptionId: subscription.id,
                    productId: subscription.product.id,
                    invoiceId: null,
                    versionId: latestVersion.id,
                    title: `New API version available for ${productTitle}`,
                    message: `${latestVersion.version} was published after this subscription started.`,
                    actionLabel: 'Review API',
                    actionUrl: `/products/${subscription.product.id}`,
                    effectiveAt: latestVersion.createdAt,
                });
            }
        });

        usageSummary.items.forEach((item) => {
            if (item.overageEnabled && item.overageRequests > 0) {
                const priceMessage =
                    item.overagePriceCents && item.overageUnitRequests
                        ? ` Projected overage charges are ${item.projectedOverageAmountCents} cents for ${item.overageRequests} extra requests.`
                        : '';

                alerts.push({
                    kind: BillingAlertKind.OVERAGE_ACTIVE,
                    severity: BillingAlertSeverity.WARNING,
                    subscriptionId: item.subscriptionId,
                    productId: item.product.id,
                    invoiceId: null,
                    versionId: null,
                    title: `Overage active for ${item.product.title}`,
                    message: `${item.usedRequests} of ${item.quotaRequests} included requests have been consumed in the current billing period.${priceMessage}`,
                    actionLabel: 'Review usage',
                    actionUrl: '/usage',
                    effectiveAt: item.periodEnd,
                });
                return;
            }

            if (item.percent >= 100) {
                alerts.push({
                    kind: BillingAlertKind.QUOTA_EXCEEDED,
                    severity: BillingAlertSeverity.DANGER,
                    subscriptionId: item.subscriptionId,
                    productId: item.product.id,
                    invoiceId: null,
                    versionId: null,
                    title: `Quota exceeded for ${item.product.title}`,
                    message: `${item.usedRequests} of ${item.quotaRequests} requests have been consumed in the current billing period.`,
                    actionLabel: 'Review usage',
                    actionUrl: '/usage',
                    effectiveAt: item.periodEnd,
                });
                return;
            }

            if (item.percent >= 80) {
                alerts.push({
                    kind: BillingAlertKind.QUOTA_NEAR_LIMIT,
                    severity: BillingAlertSeverity.WARNING,
                    subscriptionId: item.subscriptionId,
                    productId: item.product.id,
                    invoiceId: null,
                    versionId: null,
                    title: `Quota nearing limit for ${item.product.title}`,
                    message: `${item.usedRequests} of ${item.quotaRequests} requests have been consumed in the current billing period.`,
                    actionLabel: 'Review usage',
                    actionUrl: '/usage',
                    effectiveAt: item.periodEnd,
                });
            }
        });

        const severityOrder = {
            [BillingAlertSeverity.DANGER]: 0,
            [BillingAlertSeverity.WARNING]: 1,
            [BillingAlertSeverity.INFO]: 2,
        };

        alerts.sort((a, b) => {
            const severityDelta =
                severityOrder[a.severity] - severityOrder[b.severity];
            if (severityDelta !== 0) {
                return severityDelta;
            }

            return b.effectiveAt.getTime() - a.effectiveAt.getTime();
        });

        return { items: alerts };
    }

    private buildPastDueMessage(params: {
        planName: string;
        gracePeriodEndsAt: Date | null;
        retryExhaustedAt: Date | null;
    }): string {
        if (params.retryExhaustedAt) {
            return params.gracePeriodEndsAt
                ? `Renewal billing for ${params.planName} is past due. Automatic retries are exhausted; access remains available through ${params.gracePeriodEndsAt.toISOString()}.`
                : `Renewal billing for ${params.planName} is past due and automatic retries are exhausted.`;
        }

        return params.gracePeriodEndsAt
            ? `Renewal billing for ${params.planName} is past due. Access remains available through ${params.gracePeriodEndsAt.toISOString()}.`
            : `Renewal billing for ${params.planName} is past due and needs attention.`;
    }

    private async getLatestPublishedVersions(
        productIds: string[],
    ): Promise<Map<string, { id: string; version: string; createdAt: Date }>> {
        if (productIds.length === 0) {
            return new Map();
        }

        const versions = await this.prisma.apiVersion.findMany({
            where: {
                productId: {
                    in: [...new Set(productIds)],
                },
                status: VersionStatus.PUBLISHED,
            },
            orderBy: [
                {
                    productId: 'asc',
                },
                {
                    createdAt: 'desc',
                },
            ],
            select: {
                id: true,
                productId: true,
                version: true,
                createdAt: true,
            },
        });

        const latestVersions = new Map<
            string,
            { id: string; version: string; createdAt: Date }
        >();

        versions.forEach((version) => {
            if (!latestVersions.has(version.productId)) {
                latestVersions.set(version.productId, {
                    id: version.id,
                    version: version.version,
                    createdAt: version.createdAt,
                });
            }
        });

        return latestVersions;
    }
}
