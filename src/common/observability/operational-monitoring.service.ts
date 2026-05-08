import { Injectable } from '@nestjs/common';
import { SubscriptionStatus, UsageIngestJobStatus } from '@prisma/client';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

export enum OperationalAlertSeverity {
    WARNING = 'WARNING',
    DANGER = 'DANGER',
}

export type OperationalAlert = {
    kind: string;
    severity: OperationalAlertSeverity;
    title: string;
    message: string;
    details?: Record<string, number | string | boolean | null>;
};

export type OperationalMetricsSnapshot = {
    usageIngestPendingJobs: number;
    usageIngestFailedJobs: number;
    usageIngestOldestPendingAgeSeconds: number;
    usageIngestLeasePresent: boolean;
    usageIngestLeaseSecondsUntilExpiry: number;
    billingReconciliationLeasePresent: boolean;
    billingReconciliationLeaseSecondsUntilExpiry: number;
    billingOverageCollectionLeasePresent: boolean;
    billingOverageCollectionLeaseSecondsUntilExpiry: number;
    subscriptionsPastDue: number;
    auditLogsLast24h: number;
};

const BILLING_RECONCILIATION_LEASE_NAME = 'billing:stripe-reconciliation';
const BILLING_OVERAGE_COLLECTION_LEASE_NAME = 'billing:overage-collection';
const USAGE_INGEST_LEASE_NAME = 'usage:ingest-queue';
const PAST_DUE_SUBSCRIPTION_WARNING_THRESHOLD = 10;
const USAGE_QUEUE_BACKLOG_WARNING_THRESHOLD = 100;

@Injectable()
export class OperationalMonitoringService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: AppConfigService,
    ) {}

    async getMetricsSnapshot(
        now: Date = new Date(),
    ): Promise<OperationalMetricsSnapshot> {
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [
            usageIngestPendingJobs,
            usageIngestFailedJobs,
            oldestPendingUsageJob,
            subscriptionsPastDue,
            auditLogsLast24h,
            usageIngestLease,
            billingReconciliationLease,
            billingOverageCollectionLease,
        ] = await Promise.all([
            this.prisma.usageIngestJob.count({
                where: {
                    status: UsageIngestJobStatus.PENDING,
                },
            }),
            this.prisma.usageIngestJob.count({
                where: {
                    status: UsageIngestJobStatus.FAILED,
                },
            }),
            this.prisma.usageIngestJob.findFirst({
                where: {
                    status: UsageIngestJobStatus.PENDING,
                },
                orderBy: {
                    createdAt: 'asc',
                },
                select: {
                    createdAt: true,
                },
            }),
            this.prisma.subscription.count({
                where: {
                    status: SubscriptionStatus.PAST_DUE,
                },
            }),
            this.prisma.auditLog.count({
                where: {
                    createdAt: {
                        gte: last24Hours,
                    },
                },
            }),
            this.configService.usageIngestQueueEnabled
                ? this.prisma.backgroundJobLease.findUnique({
                      where: {
                          name: USAGE_INGEST_LEASE_NAME,
                      },
                      select: {
                          expiresAt: true,
                      },
                  })
                : Promise.resolve(null),
            this.configService.paymentProvider === 'STRIPE' &&
            this.configService.billingReconciliationEnabled
                ? this.prisma.backgroundJobLease.findUnique({
                      where: {
                          name: BILLING_RECONCILIATION_LEASE_NAME,
                      },
                      select: {
                          expiresAt: true,
                      },
                  })
                : Promise.resolve(null),
            this.configService.paymentProvider === 'STRIPE' &&
            this.configService.billingOverageCollectionEnabled
                ? this.prisma.backgroundJobLease.findUnique({
                      where: {
                          name: BILLING_OVERAGE_COLLECTION_LEASE_NAME,
                      },
                      select: {
                          expiresAt: true,
                      },
                  })
                : Promise.resolve(null),
        ]);

        return {
            usageIngestPendingJobs,
            usageIngestFailedJobs,
            usageIngestOldestPendingAgeSeconds: oldestPendingUsageJob
                ? Math.max(
                      0,
                      Math.floor(
                          (now.getTime() -
                              oldestPendingUsageJob.createdAt.getTime()) /
                              1000,
                      ),
                  )
                : 0,
            usageIngestLeasePresent: usageIngestLease !== null,
            usageIngestLeaseSecondsUntilExpiry: usageIngestLease
                ? Math.floor(
                      (usageIngestLease.expiresAt.getTime() - now.getTime()) /
                          1000,
                  )
                : 0,
            billingReconciliationLeasePresent:
                billingReconciliationLease !== null,
            billingReconciliationLeaseSecondsUntilExpiry:
                billingReconciliationLease
                    ? Math.floor(
                          (billingReconciliationLease.expiresAt.getTime() -
                              now.getTime()) /
                              1000,
                      )
                    : 0,
            billingOverageCollectionLeasePresent:
                billingOverageCollectionLease !== null,
            billingOverageCollectionLeaseSecondsUntilExpiry:
                billingOverageCollectionLease
                    ? Math.floor(
                          (billingOverageCollectionLease.expiresAt.getTime() -
                              now.getTime()) /
                              1000,
                      )
                    : 0,
            subscriptionsPastDue,
            auditLogsLast24h,
        };
    }

    async listOperationalAlerts(
        now: Date = new Date(),
    ): Promise<OperationalAlert[]> {
        const snapshot = await this.getMetricsSnapshot(now);
        return this.deriveOperationalAlerts(snapshot);
    }

    deriveOperationalAlerts(
        snapshot: OperationalMetricsSnapshot,
    ): OperationalAlert[] {
        const alerts: OperationalAlert[] = [];

        if (snapshot.usageIngestFailedJobs > 0) {
            alerts.push({
                kind: 'USAGE_INGEST_FAILED_JOBS',
                severity: OperationalAlertSeverity.DANGER,
                title: 'Usage ingest has failed jobs',
                message: `${snapshot.usageIngestFailedJobs} usage ingest job(s) are currently in FAILED state.`,
                details: {
                    failedJobs: snapshot.usageIngestFailedJobs,
                },
            });
        }

        if (
            snapshot.usageIngestPendingJobs >=
            USAGE_QUEUE_BACKLOG_WARNING_THRESHOLD
        ) {
            alerts.push({
                kind: 'USAGE_INGEST_BACKLOG',
                severity: OperationalAlertSeverity.WARNING,
                title: 'Usage ingest backlog is growing',
                message: `${snapshot.usageIngestPendingJobs} usage ingest job(s) are waiting in the queue.`,
                details: {
                    pendingJobs: snapshot.usageIngestPendingJobs,
                },
            });
        }

        const usageLeaseExpired =
            snapshot.usageIngestLeasePresent &&
            snapshot.usageIngestLeaseSecondsUntilExpiry < 0;
        if (
            this.configService.usageIngestQueueEnabled &&
            snapshot.usageIngestPendingJobs > 0 &&
            (!snapshot.usageIngestLeasePresent || usageLeaseExpired)
        ) {
            alerts.push({
                kind: 'USAGE_INGEST_WORKER_STALE',
                severity: OperationalAlertSeverity.DANGER,
                title: 'Usage ingest worker lease is stale',
                message:
                    'Queued usage jobs exist but the usage ingest worker lease is missing or expired.',
                details: {
                    leasePresent: snapshot.usageIngestLeasePresent,
                    secondsUntilExpiry:
                        snapshot.usageIngestLeaseSecondsUntilExpiry,
                    pendingJobs: snapshot.usageIngestPendingJobs,
                },
            });
        }

        const usageQueueStaleThresholdSeconds = Math.max(
            this.configService.usageIngestQueueIntervalSeconds * 5,
            300,
        );
        if (
            snapshot.usageIngestPendingJobs > 0 &&
            snapshot.usageIngestOldestPendingAgeSeconds >=
                usageQueueStaleThresholdSeconds
        ) {
            alerts.push({
                kind: 'USAGE_INGEST_OLD_PENDING_JOB',
                severity: OperationalAlertSeverity.WARNING,
                title: 'Usage ingest queue contains stale work',
                message: `The oldest queued usage job is ${snapshot.usageIngestOldestPendingAgeSeconds} second(s) old.`,
                details: {
                    oldestPendingAgeSeconds:
                        snapshot.usageIngestOldestPendingAgeSeconds,
                    staleThresholdSeconds: usageQueueStaleThresholdSeconds,
                },
            });
        }

        const billingLeaseExpired =
            snapshot.billingReconciliationLeasePresent &&
            snapshot.billingReconciliationLeaseSecondsUntilExpiry < 0;
        if (
            this.configService.paymentProvider === 'STRIPE' &&
            this.configService.billingReconciliationEnabled &&
            (!snapshot.billingReconciliationLeasePresent || billingLeaseExpired)
        ) {
            alerts.push({
                kind: 'BILLING_RECONCILIATION_STALE',
                severity: OperationalAlertSeverity.WARNING,
                title: 'Billing reconciliation lease is stale',
                message:
                    'Stripe billing reconciliation is enabled but its worker lease is missing or expired.',
                details: {
                    leasePresent: snapshot.billingReconciliationLeasePresent,
                    secondsUntilExpiry:
                        snapshot.billingReconciliationLeaseSecondsUntilExpiry,
                },
            });
        }

        const overageCollectionLeaseExpired =
            snapshot.billingOverageCollectionLeasePresent &&
            snapshot.billingOverageCollectionLeaseSecondsUntilExpiry < 0;
        if (
            this.configService.paymentProvider === 'STRIPE' &&
            this.configService.billingOverageCollectionEnabled &&
            (!snapshot.billingOverageCollectionLeasePresent ||
                overageCollectionLeaseExpired)
        ) {
            alerts.push({
                kind: 'BILLING_OVERAGE_COLLECTION_STALE',
                severity: OperationalAlertSeverity.WARNING,
                title: 'Billing overage collection lease is stale',
                message:
                    'Automated overage collection is enabled but its worker lease is missing or expired.',
                details: {
                    leasePresent: snapshot.billingOverageCollectionLeasePresent,
                    secondsUntilExpiry:
                        snapshot.billingOverageCollectionLeaseSecondsUntilExpiry,
                },
            });
        }

        if (
            snapshot.subscriptionsPastDue >=
            PAST_DUE_SUBSCRIPTION_WARNING_THRESHOLD
        ) {
            alerts.push({
                kind: 'SUBSCRIPTIONS_PAST_DUE_HIGH',
                severity: OperationalAlertSeverity.WARNING,
                title: 'Past-due subscriptions exceed the warning threshold',
                message: `${snapshot.subscriptionsPastDue} subscription(s) are currently in PAST_DUE state.`,
                details: {
                    pastDueSubscriptions: snapshot.subscriptionsPastDue,
                    warningThreshold: PAST_DUE_SUBSCRIPTION_WARNING_THRESHOLD,
                },
            });
        }

        const severityOrder = {
            [OperationalAlertSeverity.DANGER]: 0,
            [OperationalAlertSeverity.WARNING]: 1,
        };

        alerts.sort(
            (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
        );

        return alerts;
    }
}
