import { ApiProperty } from '@nestjs/swagger';

export type GatewayBodyEncoding = 'json' | 'text' | 'base64' | null;

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

    @ApiProperty({ example: 20, nullable: true })
    burstLimit!: number | null;

    @ApiProperty({ example: 14, nullable: true })
    remainingBurstRequests!: number | null;

    @ApiProperty({ example: 10, nullable: true })
    burstWindowSeconds!: number | null;

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
            'Parsed JSON body when upstream returns JSON, plain text for textual responses, base64 string for binary responses, or null when upstream returns no body.',
        example: { status: 'ok' },
        nullable: true,
    })
    body!: unknown;

    @ApiProperty({
        example: 'json',
        enum: ['json', 'text', 'base64'],
        nullable: true,
    })
    bodyEncoding!: GatewayBodyEncoding;

    @ApiProperty({ type: GatewayUsageMetaDto })
    usage!: GatewayUsageMetaDto;
}
