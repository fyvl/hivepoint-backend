import { ApiProperty } from '@nestjs/swagger';

export class UsageSummaryPlanDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Starter' })
    name!: string;

    @ApiProperty({ example: 1000 })
    quotaRequests!: number;
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

    @ApiProperty({ type: String, format: 'date-time' })
    periodStart!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    periodEnd!: Date;

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
