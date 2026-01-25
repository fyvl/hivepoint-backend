import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordUsageDto {
    @ApiProperty({ example: 'uuid' })
    subscriptionId!: string;

    @ApiProperty({ example: '/v1/search' })
    endpoint!: string;

    @ApiProperty({ example: 1, minimum: 1 })
    requestCount!: number;

    @ApiPropertyOptional({ example: '2026-01-25T10:00:00.000Z' })
    occurredAt?: string;
}
