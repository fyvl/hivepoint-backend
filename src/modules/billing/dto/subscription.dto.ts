import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';

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

    @ApiProperty({ example: 'uuid' })
    productId!: string;
}

export class SubscriptionProductDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Payments API' })
    title!: string;
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

    @ApiProperty({ example: false })
    cancelAtPeriodEnd!: boolean;

    @ApiProperty({ type: String, format: 'date-time' })
    createdAt!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    updatedAt!: Date;

    @ApiProperty({ type: SubscriptionPlanDto })
    plan!: SubscriptionPlanDto;

    @ApiProperty({ type: SubscriptionProductDto })
    product!: SubscriptionProductDto;
}
