import { ApiProperty } from '@nestjs/swagger';

export class CreateProductDto {
    @ApiProperty({ example: 'Payments API', minLength: 3, maxLength: 120 })
    title!: string;

    @ApiProperty({
        example: 'Accept payments with a single endpoint.',
        minLength: 10,
        maxLength: 2000,
    })
    description!: string;

    @ApiProperty({ example: 'payments', minLength: 2, maxLength: 60 })
    category!: string;

    @ApiProperty({
        type: [String],
        example: ['payments', 'fintech'],
        maxItems: 20,
    })
    tags!: string[];
}
