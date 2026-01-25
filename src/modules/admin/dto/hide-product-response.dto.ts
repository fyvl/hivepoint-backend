import { ApiProperty } from '@nestjs/swagger';

export class HideProductResponseDto {
    @ApiProperty({ example: true })
    ok!: boolean;

    @ApiProperty({ example: 'uuid' })
    productId!: string;
}
