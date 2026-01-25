import { ApiProperty } from '@nestjs/swagger';
import { ProductDto } from './product.dto';

export class ProductListResponseDto {
    @ApiProperty({ type: [ProductDto] })
    items!: ProductDto[];

    @ApiProperty({ example: 123 })
    total!: number;

    @ApiProperty({ example: 20 })
    limit!: number;

    @ApiProperty({ example: 0 })
    offset!: number;
}
