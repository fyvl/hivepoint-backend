import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';

export class UpdateProductDto {
    @ApiPropertyOptional({
        example: 'Payments API',
        minLength: 3,
        maxLength: 120,
    })
    title?: string;

    @ApiPropertyOptional({
        example: 'Accept payments with a single endpoint.',
        minLength: 10,
        maxLength: 2000,
    })
    description?: string;

    @ApiPropertyOptional({ example: 'payments', minLength: 2, maxLength: 60 })
    category?: string;

    @ApiPropertyOptional({
        type: [String],
        example: ['payments', 'fintech'],
        maxItems: 20,
    })
    tags?: string[];

    @ApiPropertyOptional({ enum: ProductStatus })
    status?: ProductStatus;
}
