import { ApiProperty } from '@nestjs/swagger';

export class GatewayUsageMetaDto {
    @ApiProperty({ example: 'sub_123' })
    subscriptionId!: string;

    @ApiProperty({ example: 1 })
    requestCount!: number;

    @ApiProperty({ example: 99, nullable: true })
    remainingRequests!: number | null;

    @ApiProperty({ example: 120, nullable: true })
    rateLimitRpm!: number | null;

    @ApiProperty({ example: 52, nullable: true })
    remainingRateLimitRequests!: number | null;

    @ApiProperty({ example: true })
    usageRecorded!: boolean;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    periodEnd!: Date | null;
}

export class GatewayDispatchResponseDto {
    @ApiProperty({ example: true })
    ok!: boolean;

    @ApiProperty({ example: 200 })
    status!: number;

    @ApiProperty({ example: 'GET' })
    method!: string;

    @ApiProperty({ example: 'https://seller.example.com/v1/health' })
    upstreamUrl!: string;

    @ApiProperty({ example: 'application/json', nullable: true })
    contentType!: string | null;

    @ApiProperty({
        type: 'object',
        additionalProperties: { type: 'string' },
        example: { 'content-type': 'application/json' },
    })
    headers!: Record<string, string>;

    @ApiProperty({
        description:
            'Parsed JSON body when upstream returns JSON, otherwise plain text or null.',
        example: { status: 'ok' },
        nullable: true,
    })
    body!: unknown;

    @ApiProperty({ type: GatewayUsageMetaDto })
    usage!: GatewayUsageMetaDto;
}