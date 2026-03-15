import { ApiProperty } from '@nestjs/swagger';
import {
    BillingProvider,
    InvoiceStatus,
    SubscriptionStatus,
} from '@prisma/client';

export class SubscriptionPlanDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Starter' })
    name!: string;

    @ApiProperty({ example: 1000 })
    priceCents!: number;

    @ApiProperty({ example: 'EUR' })
    currency!: string;

    @ApiProperty({ example: 10000 })
    quotaRequests!: number;

    @ApiProperty({ type: Number, example: 120, nullable: true })
    rateLimitRpm!: number | null;

    @ApiProperty({ example: 'uuid' })
    productId!: string;
}

export class SubscriptionProductDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Payments API' })
    title!: string;
}

export class SubscriptionInvoiceDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ enum: InvoiceStatus })
    status!: InvoiceStatus;

    @ApiProperty({ example: 9900 })
    amountCents!: number;

    @ApiProperty({ example: 'USD' })
    currency!: string;

    @ApiProperty({ example: 2 })
    attemptCount!: number;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    nextPaymentAttemptAt!: Date | null;

    @ApiProperty({ type: String, format: 'date-time' })
    createdAt!: Date;
}

export class SubscriptionDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ enum: SubscriptionStatus })
    status!: SubscriptionStatus;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    currentPeriodStart!: Date | null;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    currentPeriodEnd!: Date | null;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    gracePeriodEndsAt!: Date | null;

    @ApiProperty({ example: false })
    cancelAtPeriodEnd!: boolean;

    @ApiProperty({ enum: BillingProvider })
    paymentProvider!: BillingProvider;

    @ApiProperty({ example: false })
    hasExternalSubscription!: boolean;

    @ApiProperty({ type: String, format: 'date-time' })
    createdAt!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    updatedAt!: Date;

    @ApiProperty({ type: SubscriptionPlanDto })
    plan!: SubscriptionPlanDto;

    @ApiProperty({ type: SubscriptionProductDto })
    product!: SubscriptionProductDto;

    @ApiProperty({ type: SubscriptionInvoiceDto, nullable: true })
    latestInvoice!: SubscriptionInvoiceDto | null;

    @ApiProperty({ type: SubscriptionInvoiceDto, isArray: true })
    invoices!: SubscriptionInvoiceDto[];
}
