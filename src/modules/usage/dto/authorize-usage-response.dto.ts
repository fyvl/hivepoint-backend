import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const usageAuthorizationReasons = [
    'INVALID_API_KEY',
    'NO_ACTIVE_SUBSCRIPTION',
    'QUOTA_EXCEEDED',
    'RATE_LIMIT_EXCEEDED',
] as const;

export type UsageAuthorizationReason =
    (typeof usageAuthorizationReasons)[number];

export class UsageAuthorizationPlanDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Starter' })
    name!: string;

    @ApiProperty({ example: 1000 })
    quotaRequests!: number;

    @ApiProperty({ example: 120, nullable: true })
    rateLimitRpm!: number | null;
}

export class UsageAuthorizationProductDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Payments API' })
    title!: string;
}

export class AuthorizeUsageResponseDto {
    @ApiProperty({ example: true })
    allowed!: boolean;

    @ApiPropertyOptional({ enum: usageAuthorizationReasons })
    reason?: UsageAuthorizationReason;

    @ApiPropertyOptional({ example: 'uuid' })
    apiKeyId?: string;

    @ApiPropertyOptional({ example: 'uuid' })
    subscriptionId?: string;

    @ApiPropertyOptional({ example: 'uuid' })
    userId?: string;

    @ApiPropertyOptional({ type: String, format: 'date-time' })
    periodStart?: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time' })
    periodEnd?: Date;

    @ApiPropertyOptional({ example: 120 })
    usedRequests?: number;

    @ApiPropertyOptional({ example: 1 })
    requestedRequests?: number;

    @ApiPropertyOptional({ example: 1000 })
    quotaRequests?: number;

    @ApiPropertyOptional({ example: 879 })
    remainingRequests?: number;

    @ApiPropertyOptional({ example: 120, nullable: true })
    rateLimitRpm?: number | null;

    @ApiPropertyOptional({ example: 52, nullable: true })
    remainingRateLimitRequests?: number | null;

    @ApiPropertyOptional({ example: false })
    usageRecorded?: boolean;

    @ApiPropertyOptional({ type: UsageAuthorizationPlanDto })
    plan?: UsageAuthorizationPlanDto;

    @ApiPropertyOptional({ type: UsageAuthorizationProductDto })
    product?: UsageAuthorizationProductDto;
}
