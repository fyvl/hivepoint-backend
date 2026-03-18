import { ApiProperty } from '@nestjs/swagger';

export enum BillingAlertKind {
    QUOTA_NEAR_LIMIT = 'QUOTA_NEAR_LIMIT',
    QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
    UPCOMING_RENEWAL = 'UPCOMING_RENEWAL',
    PAYMENT_PAST_DUE = 'PAYMENT_PAST_DUE',
    PAYMENT_RETRY_SCHEDULED = 'PAYMENT_RETRY_SCHEDULED',
    NEW_VERSION_AVAILABLE = 'NEW_VERSION_AVAILABLE',
}

export enum BillingAlertSeverity {
    INFO = 'INFO',
    WARNING = 'WARNING',
    DANGER = 'DANGER',
}

export class BillingAlertDto {
    @ApiProperty({ enum: BillingAlertKind })
    kind!: BillingAlertKind;

    @ApiProperty({ enum: BillingAlertSeverity })
    severity!: BillingAlertSeverity;

    @ApiProperty({ example: 'uuid', nullable: true })
    subscriptionId!: string | null;

    @ApiProperty({ example: 'uuid', nullable: true })
    productId!: string | null;

    @ApiProperty({ example: 'uuid', nullable: true })
    invoiceId!: string | null;

    @ApiProperty({ example: 'uuid', nullable: true })
    versionId!: string | null;

    @ApiProperty({ example: 'Payment action required' })
    title!: string;

    @ApiProperty({
        example:
            'A renewal payment failed. Update the payment method before access expires.',
    })
    message!: string;

    @ApiProperty({ example: 'Open billing', nullable: true })
    actionLabel!: string | null;

    @ApiProperty({ example: '/billing', nullable: true })
    actionUrl!: string | null;

    @ApiProperty({ type: String, format: 'date-time' })
    effectiveAt!: Date;
}

export class BillingAlertsResponseDto {
    @ApiProperty({ type: BillingAlertDto, isArray: true })
    items!: BillingAlertDto[];
}
