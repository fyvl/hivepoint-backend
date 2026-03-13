import { ApiProperty } from '@nestjs/swagger';
import {
    BillingProvider,
    InvoiceStatus,
    SubscriptionStatus,
} from '@prisma/client';

export class CheckoutStatusDto {
    @ApiProperty({ example: 'cs_test_123' })
    sessionId!: string;

    @ApiProperty({ example: 'uuid' })
    invoiceId!: string;

    @ApiProperty({ enum: InvoiceStatus })
    invoiceStatus!: InvoiceStatus;

    @ApiProperty({ example: 'uuid' })
    subscriptionId!: string;

    @ApiProperty({ enum: SubscriptionStatus })
    subscriptionStatus!: SubscriptionStatus;

    @ApiProperty({ example: false })
    cancelAtPeriodEnd!: boolean;

    @ApiProperty({ enum: BillingProvider })
    paymentProvider!: BillingProvider;

    @ApiProperty({ example: 'Payments API' })
    productTitle!: string;

    @ApiProperty({ example: 'Starter' })
    planName!: string;
}
