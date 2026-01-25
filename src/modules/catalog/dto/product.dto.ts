import { ApiProperty } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';

export class ProductDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'uuid' })
    ownerId!: string;

    @ApiProperty({ example: 'Payments API' })
    title!: string;

    @ApiProperty({ example: 'Accept payments with a single endpoint.' })
    description!: string;

    @ApiProperty({ example: 'payments' })
    category!: string;

    @ApiProperty({ type: [String], example: ['payments', 'fintech'] })
    tags!: string[];

    @ApiProperty({ enum: ProductStatus })
    status!: ProductStatus;

    @ApiProperty({ type: String, format: 'date-time' })
    createdAt!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    updatedAt!: Date;
}
