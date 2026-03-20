import { ApiProperty } from '@nestjs/swagger';
import { OperationalAlertDto } from './operational-alert.dto';

export class OperationalMetricsSnapshotDto {
    @ApiProperty({ example: 12 })
    usageIngestPendingJobs!: number;

    @ApiProperty({ example: 2 })
    usageIngestFailedJobs!: number;

    @ApiProperty({ example: 300 })
    usageIngestOldestPendingAgeSeconds!: number;

    @ApiProperty({ example: true })
    usageIngestLeasePresent!: boolean;

    @ApiProperty({ example: 45 })
    usageIngestLeaseSecondsUntilExpiry!: number;

    @ApiProperty({ example: true })
    billingReconciliationLeasePresent!: boolean;

    @ApiProperty({ example: 180 })
    billingReconciliationLeaseSecondsUntilExpiry!: number;

    @ApiProperty({ example: true })
    billingOverageCollectionLeasePresent!: boolean;

    @ApiProperty({ example: 180 })
    billingOverageCollectionLeaseSecondsUntilExpiry!: number;

    @ApiProperty({ example: 4 })
    subscriptionsPastDue!: number;

    @ApiProperty({ example: 9 })
    auditLogsLast24h!: number;
}

export class OperationalAlertDeliveryStateDto {
    @ApiProperty({ example: 'USAGE_INGEST_FAILED_JOBS' })
    kind!: string;

    @ApiProperty({ example: 'DANGER' })
    severity!: string;

    @ApiProperty({ example: 'Usage ingest has failed jobs' })
    title!: string;

    @ApiProperty({
        example: '3 usage ingest job(s) are currently in FAILED state.',
    })
    message!: string;

    @ApiProperty({ required: false, nullable: true, type: Object })
    details!: unknown;

    @ApiProperty({ type: String, format: 'date-time' })
    firstObservedAt!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    lastObservedAt!: Date;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    resolvedAt!: Date | null;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    lastDeliveredAt!: Date | null;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    lastDeliveryAttemptAt!: Date | null;

    @ApiProperty({ example: 2 })
    deliveryCount!: number;

    @ApiProperty({ example: 1 })
    deliveryFailures!: number;

    @ApiProperty({
        example: 'Webhook responded with 500',
        nullable: true,
    })
    lastDeliveryError!: string | null;
}

export class OperationalAlertDeliveryTargetDto {
    @ApiProperty({ example: 'webhook' })
    key!: string;

    @ApiProperty({ example: 'alerts.example.com' })
    host!: string;
}

export class OperationalAlertDeliveryTargetStateDto {
    @ApiProperty({ example: 'USAGE_INGEST_FAILED_JOBS' })
    alertKind!: string;

    @ApiProperty({ example: 'webhook' })
    targetKey!: string;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    resolvedAt!: Date | null;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    lastDeliveredAt!: Date | null;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    lastDeliveryAttemptAt!: Date | null;

    @ApiProperty({ example: 2 })
    deliveryCount!: number;

    @ApiProperty({ example: 1 })
    deliveryFailures!: number;

    @ApiProperty({
        example: 'Webhook responded with 500',
        nullable: true,
    })
    lastDeliveryError!: string | null;
}

export class OperationalAlertDeliveryStatusDto {
    @ApiProperty({ example: true })
    enabled!: boolean;

    @ApiProperty({ example: true })
    webhookConfigured!: boolean;

    @ApiProperty({ example: 2 })
    configuredTargetCount!: number;

    @ApiProperty({ type: [OperationalAlertDeliveryTargetDto] })
    targets!: Array<{
        key: string;
        host: string;
    }>;

    @ApiProperty({ example: 60 })
    intervalSeconds!: number;

    @ApiProperty({ example: 900 })
    cooldownSeconds!: number;

    @ApiProperty({ type: [OperationalAlertDeliveryStateDto] })
    items!: OperationalAlertDeliveryStateDto[];

    @ApiProperty({ type: [OperationalAlertDeliveryTargetStateDto] })
    targetItems!: Array<{
        alertKind: string;
        targetKey: string;
        resolvedAt: Date | null;
        lastDeliveredAt: Date | null;
        lastDeliveryAttemptAt: Date | null;
        deliveryCount: number;
        deliveryFailures: number;
        lastDeliveryError: string | null;
    }>;
}

export class OperationalMetricsHistoryPointDto extends OperationalMetricsSnapshotDto {
    @ApiProperty({ type: String, format: 'date-time' })
    capturedAt!: Date;
}

export class OperationalMetricsHistoryStatusDto {
    @ApiProperty({ example: true })
    enabled!: boolean;

    @ApiProperty({ example: 300 })
    intervalSeconds!: number;

    @ApiProperty({ example: 30 })
    retentionDays!: number;

    @ApiProperty({ type: [OperationalMetricsHistoryPointDto] })
    items!: OperationalMetricsHistoryPointDto[];
}

export class OperationalDashboardResponseDto {
    @ApiProperty({ type: OperationalMetricsSnapshotDto })
    snapshot!: OperationalMetricsSnapshotDto;

    @ApiProperty({ type: [OperationalAlertDto] })
    alerts!: OperationalAlertDto[];

    @ApiProperty({ type: OperationalAlertDeliveryStatusDto })
    alertDelivery!: OperationalAlertDeliveryStatusDto;

    @ApiProperty({ type: OperationalMetricsHistoryStatusDto })
    metricsHistory!: OperationalMetricsHistoryStatusDto;
}
