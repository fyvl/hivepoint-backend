import { ApiProperty } from '@nestjs/swagger';

export class GetPlansQueryDto {
    @ApiProperty({ example: 'uuid' })
    productId!: string;
}
