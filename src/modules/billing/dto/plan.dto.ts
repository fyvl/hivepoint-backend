import { ApiProperty } from '@nestjs/swagger';
import { PlanPeriod } from '@prisma/client';

export class PlanDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'uuid' })
    productId!: string;

    @ApiProperty({ example: 'Starter' })
    name!: string;

    @ApiProperty({ example: 1000 })
    priceCents!: number;

    @ApiProperty({ example: 'EUR' })
    currency!: string;

    @ApiProperty({ enum: PlanPeriod })
    period!: PlanPeriod;

    @ApiProperty({ example: 10000 })
    quotaRequests!: number;

    @ApiProperty({ type: Number, example: 120, nullable: true })
    rateLimitRpm!: number | null;

    @ApiProperty({ example: true })
    isActive!: boolean;

    @ApiProperty({ type: String, format: 'date-time' })
    createdAt!: Date;
}
