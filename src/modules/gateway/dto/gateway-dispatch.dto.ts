import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GatewayDispatchDto {
    @ApiProperty({ example: 'prod_123' })
    productId!: string;

    @ApiProperty({ example: '/health' })
    path!: string;

    @ApiPropertyOptional({
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        default: 'GET',
    })
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: { type: 'string' },
        example: { Accept: 'application/json' },
    })
    headers?: Record<string, string>;

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: {
            oneOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
            ],
        },
        example: { verbose: true, limit: 10 },
    })
    query?: Record<string, string | number | boolean>;

    @ApiPropertyOptional({
        description:
            'JSON body forwarded to the upstream API when method allows a payload.',
        example: { input: 'hello' },
    })
    body?: unknown;

    @ApiPropertyOptional({ example: 1, default: 1 })
    requestCount?: number;
}
