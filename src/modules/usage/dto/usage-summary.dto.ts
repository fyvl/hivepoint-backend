import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';

export class UsageSummaryPlanDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Starter' })
    name!: string;

    @ApiProperty({ example: 1000 })
    quotaRequests!: number;

    @ApiProperty({ example: 120, nullable: true })
    rateLimitRpm!: number | null;
}

export class UsageSummaryProductDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Payments API' })
    title!: string;
}

export class UsageSummaryItemDto {
    @ApiProperty({ example: 'uuid' })
    subscriptionId!: string;

    @ApiProperty({ enum: SubscriptionStatus })
    status!: SubscriptionStatus;

    @ApiProperty({ type: String, format: 'date-time' })
    periodStart!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    periodEnd!: Date;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    gracePeriodEndsAt!: Date | null;

    @ApiProperty({ example: 123 })
    usedRequests!: number;

    @ApiProperty({ example: 1000 })
    quotaRequests!: number;

    @ApiProperty({ example: 12 })
    percent!: number;

    @ApiProperty({ type: UsageSummaryPlanDto })
    plan!: UsageSummaryPlanDto;

    @ApiProperty({ type: UsageSummaryProductDto })
    product!: UsageSummaryProductDto;
}

export class UsageSummaryResponseDto {
    @ApiProperty({ type: [UsageSummaryItemDto] })
    items!: UsageSummaryItemDto[];
}
