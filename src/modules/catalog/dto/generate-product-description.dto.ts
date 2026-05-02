import { ApiProperty } from '@nestjs/swagger';

export class GenerateProductDescriptionDto {
    @ApiProperty({ example: 'Payments API', minLength: 3, maxLength: 120 })
    title!: string;

    @ApiProperty({ example: 'payments', minLength: 2, maxLength: 60 })
    category!: string;

    @ApiProperty({
        type: [String],
        example: ['payments', 'cards', 'invoices'],
        maxItems: 20,
    })
    tags!: string[];
}
