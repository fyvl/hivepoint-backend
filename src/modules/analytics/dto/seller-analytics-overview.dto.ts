import { ApiProperty } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';

export class SellerAnalyticsTopEndpointDto {
    @ApiProperty({ example: '/v1/search' })
    endpoint!: string;

    @ApiProperty({ example: 240 })
    requestCount!: number;
}

export class SellerAnalyticsLatestVersionDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'v2' })
    version!: string;

    @ApiProperty({ type: String, format: 'date-time' })
    createdAt!: Date;
}

export class SellerProductAnalyticsDto {
    @ApiProperty({ example: 'uuid' })
    productId!: string;

    @ApiProperty({ example: 'Payments API' })
    title!: string;

    @ApiProperty({ enum: ProductStatus })
    status!: ProductStatus;

    @ApiProperty({ example: 128 })
    views30d!: number;

    @ApiProperty({ example: 12 })
    subscriptions30d!: number;

    @ApiProperty({ example: 9.4 })
    conversionRate30d!: number;

    @ApiProperty({ example: 5 })
    activeClients!: number;

    @ApiProperty({ example: 1 })
    pastDueClients!: number;

    @ApiProperty({ example: 2 })
    failedPayments30d!: number;

    @ApiProperty({ example: 1240 })
    requests30d!: number;

    @ApiProperty({
        type: SellerAnalyticsLatestVersionDto,
        nullable: true,
    })
    latestPublishedVersion!: SellerAnalyticsLatestVersionDto | null;

    @ApiProperty({ type: SellerAnalyticsTopEndpointDto, isArray: true })
    topEndpoints!: SellerAnalyticsTopEndpointDto[];
}

export class SellerAnalyticsTotalsDto {
    @ApiProperty({ example: 3 })
    productCount!: number;

    @ApiProperty({ example: 2 })
    publishedProductCount!: number;

    @ApiProperty({ example: 540 })
    views30d!: number;

    @ApiProperty({ example: 24 })
    subscriptions30d!: number;

    @ApiProperty({ example: 11 })
    activeClients!: number;

    @ApiProperty({ example: 2 })
    pastDueClients!: number;

    @ApiProperty({ example: 3 })
    failedPayments30d!: number;

    @ApiProperty({ example: 14500 })
    requests30d!: number;

    @ApiProperty({ example: 29900 })
    mrrCents!: number;
}

export class SellerAnalyticsOverviewResponseDto {
    @ApiProperty({ example: 30 })
    windowDays!: number;

    @ApiProperty({ type: SellerAnalyticsTotalsDto })
    totals!: SellerAnalyticsTotalsDto;

    @ApiProperty({ type: SellerProductAnalyticsDto, isArray: true })
    products!: SellerProductAnalyticsDto[];
}
