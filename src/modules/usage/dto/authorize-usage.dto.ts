import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthorizeUsageDto {
    @ApiProperty({ example: 'hp_example_api_key' })
    apiKey!: string;

    @ApiProperty({ example: 'uuid' })
    productId!: string;

    @ApiProperty({ example: '/v1/search' })
    endpoint!: string;

    @ApiProperty({ example: 1, minimum: 1 })
    requestCount!: number;

    @ApiPropertyOptional({ example: '2026-01-25T10:00:00.000Z' })
    occurredAt?: string;

    @ApiPropertyOptional({
        example: false,
        description:
            'If true, records usage immediately after a successful authorization check.',
    })
    consume?: boolean;
}
