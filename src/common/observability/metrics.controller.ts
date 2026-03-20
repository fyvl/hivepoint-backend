import { Controller, Get, Header } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { HttpMetricsService } from './http-metrics.service';
import { OperationalMonitoringService } from './operational-monitoring.service';

@Controller()
export class MetricsController {
    constructor(
        private readonly configService: AppConfigService,
        private readonly httpMetricsService: HttpMetricsService,
        private readonly operationalMonitoringService: OperationalMonitoringService,
    ) {}

    @Get('metrics')
    @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
    async getMetrics(): Promise<string> {
        const [httpMetrics, snapshot] = await Promise.all([
            this.httpMetricsService.getSnapshot(),
            this.operationalMonitoringService.getMetricsSnapshot(),
        ]);
        const alerts =
            this.operationalMonitoringService.deriveOperationalAlerts(snapshot);

        const lines: string[] = [
            '# HELP hivepoint_http_requests_total Total HTTP requests handled by the backend',
            '# TYPE hivepoint_http_requests_total counter',
        ];

        httpMetrics.forEach((item) => {
            const labels = this.formatLabels({
                method: item.method,
                path: item.path,
                status_code: String(item.statusCode),
            });
            lines.push(`hivepoint_http_requests_total${labels} ${item.count}`);
        });

        lines.push(
            '# HELP hivepoint_http_request_duration_ms_sum Total observed HTTP request duration in milliseconds',
        );
        lines.push('# TYPE hivepoint_http_request_duration_ms_sum counter');
        httpMetrics.forEach((item) => {
            const labels = this.formatLabels({
                method: item.method,
                path: item.path,
                status_code: String(item.statusCode),
            });
            lines.push(
                `hivepoint_http_request_duration_ms_sum${labels} ${item.durationSumMs.toFixed(
                    3,
                )}`,
            );
        });

        lines.push(
            '# HELP hivepoint_http_request_duration_ms_count Number of HTTP duration observations',
        );
        lines.push('# TYPE hivepoint_http_request_duration_ms_count counter');
        httpMetrics.forEach((item) => {
            const labels = this.formatLabels({
                method: item.method,
                path: item.path,
                status_code: String(item.statusCode),
            });
            lines.push(
                `hivepoint_http_request_duration_ms_count${labels} ${item.count}`,
            );
        });

        lines.push(
            '# HELP hivepoint_http_request_duration_ms_max Maximum observed HTTP request duration in milliseconds',
        );
        lines.push('# TYPE hivepoint_http_request_duration_ms_max gauge');
        httpMetrics.forEach((item) => {
            const labels = this.formatLabels({
                method: item.method,
                path: item.path,
                status_code: String(item.statusCode),
            });
            lines.push(
                `hivepoint_http_request_duration_ms_max${labels} ${item.durationMaxMs.toFixed(
                    3,
                )}`,
            );
        });

        lines.push(
            '# HELP hivepoint_usage_ingest_jobs Number of usage ingest jobs by status',
        );
        lines.push('# TYPE hivepoint_usage_ingest_jobs gauge');
        lines.push(
            `hivepoint_usage_ingest_jobs${this.formatLabels({
                status: 'pending',
            })} ${snapshot.usageIngestPendingJobs}`,
        );
        lines.push(
            `hivepoint_usage_ingest_jobs${this.formatLabels({
                status: 'failed',
            })} ${snapshot.usageIngestFailedJobs}`,
        );

        lines.push(
            '# HELP hivepoint_usage_ingest_oldest_pending_age_seconds Age in seconds of the oldest queued usage ingest job',
        );
        lines.push(
            '# TYPE hivepoint_usage_ingest_oldest_pending_age_seconds gauge',
        );
        lines.push(
            `hivepoint_usage_ingest_oldest_pending_age_seconds ${snapshot.usageIngestOldestPendingAgeSeconds}`,
        );

        lines.push(
            '# HELP hivepoint_background_job_lease_present Whether a background job lease is present',
        );
        lines.push('# TYPE hivepoint_background_job_lease_present gauge');
        lines.push(
            `hivepoint_background_job_lease_present${this.formatLabels({
                job: 'usage_ingest_queue',
            })} ${snapshot.usageIngestLeasePresent ? 1 : 0}`,
        );
        lines.push(
            `hivepoint_background_job_lease_present${this.formatLabels({
                job: 'billing_reconciliation',
            })} ${snapshot.billingReconciliationLeasePresent ? 1 : 0}`,
        );
        lines.push(
            `hivepoint_background_job_lease_present${this.formatLabels({
                job: 'billing_overage_collection',
            })} ${snapshot.billingOverageCollectionLeasePresent ? 1 : 0}`,
        );

        lines.push(
            '# HELP hivepoint_background_job_lease_seconds_until_expiry Seconds until the background job lease expires',
        );
        lines.push(
            '# TYPE hivepoint_background_job_lease_seconds_until_expiry gauge',
        );
        lines.push(
            `hivepoint_background_job_lease_seconds_until_expiry${this.formatLabels(
                {
                    job: 'usage_ingest_queue',
                },
            )} ${snapshot.usageIngestLeaseSecondsUntilExpiry}`,
        );
        lines.push(
            `hivepoint_background_job_lease_seconds_until_expiry${this.formatLabels(
                {
                    job: 'billing_reconciliation',
                },
            )} ${snapshot.billingReconciliationLeaseSecondsUntilExpiry}`,
        );
        lines.push(
            `hivepoint_background_job_lease_seconds_until_expiry${this.formatLabels(
                {
                    job: 'billing_overage_collection',
                },
            )} ${snapshot.billingOverageCollectionLeaseSecondsUntilExpiry}`,
        );

        lines.push(
            '# HELP hivepoint_subscriptions Number of subscriptions by status',
        );
        lines.push('# TYPE hivepoint_subscriptions gauge');
        lines.push(
            `hivepoint_subscriptions${this.formatLabels({
                status: 'past_due',
            })} ${snapshot.subscriptionsPastDue}`,
        );

        lines.push(
            '# HELP hivepoint_audit_logs_created_last_24h Audit log rows created in the last 24 hours',
        );
        lines.push('# TYPE hivepoint_audit_logs_created_last_24h gauge');
        lines.push(
            `hivepoint_audit_logs_created_last_24h ${snapshot.auditLogsLast24h}`,
        );

        const activeDangerAlerts = alerts.filter(
            (alert) => alert.severity === 'DANGER',
        ).length;
        const activeWarningAlerts = alerts.filter(
            (alert) => alert.severity === 'WARNING',
        ).length;

        lines.push(
            '# HELP hivepoint_operational_alerts_active Number of active operational alerts by severity',
        );
        lines.push('# TYPE hivepoint_operational_alerts_active gauge');
        lines.push(
            `hivepoint_operational_alerts_active${this.formatLabels({
                severity: 'danger',
            })} ${activeDangerAlerts}`,
        );
        lines.push(
            `hivepoint_operational_alerts_active${this.formatLabels({
                severity: 'warning',
            })} ${activeWarningAlerts}`,
        );

        lines.push(
            '# HELP hivepoint_alert_delivery_enabled Whether external alert delivery is enabled',
        );
        lines.push('# TYPE hivepoint_alert_delivery_enabled gauge');
        lines.push(
            `hivepoint_alert_delivery_enabled ${this.configService.alertDeliveryEnabled ? 1 : 0}`,
        );

        lines.push(
            '# HELP hivepoint_alert_delivery_webhook_configured Whether an external alert delivery webhook URL is configured',
        );
        lines.push('# TYPE hivepoint_alert_delivery_webhook_configured gauge');
        lines.push(
            `hivepoint_alert_delivery_webhook_configured ${this.configService.alertDeliveryTargets.length > 0 ? 1 : 0}`,
        );

        lines.push(
            '# HELP hivepoint_alert_delivery_target_count Number of configured external alert delivery targets',
        );
        lines.push('# TYPE hivepoint_alert_delivery_target_count gauge');
        lines.push(
            `hivepoint_alert_delivery_target_count ${this.configService.alertDeliveryTargets.length}`,
        );

        return `${lines.join('\n')}\n`;
    }

    private formatLabels(labels: Record<string, string>): string {
        const entries = Object.entries(labels);
        if (entries.length === 0) {
            return '';
        }

        const serialized = entries
            .map(([key, value]) => `${key}="${this.escapeLabelValue(value)}"`)
            .join(',');

        return `{${serialized}}`;
    }

    private escapeLabelValue(value: string): string {
        return value
            .replace(/\\/g, '\\\\')
            .replace(/\n/g, '\\n')
            .replace(/"/g, '\\"');
    }
}
