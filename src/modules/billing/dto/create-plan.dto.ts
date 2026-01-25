import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanPeriod } from '@prisma/client';

export class CreatePlanDto {
    @ApiProperty({ example: 'uuid' })
    productId!: string;

    @ApiProperty({ example: 'Starter', minLength: 2, maxLength: 60 })
    name!: string;

    @ApiProperty({ example: 1000, minimum: 0 })
    priceCents!: number;

    @ApiPropertyOptional({ example: 'EUR' })
    currency?: string;

    @ApiPropertyOptional({ enum: PlanPeriod })
    period?: PlanPeriod;

    @ApiProperty({ example: 10000, minimum: 1 })
    quotaRequests!: number;

    @ApiPropertyOptional({ example: true })
    isActive?: boolean;
}
