import { ApiProperty } from '@nestjs/swagger';
import { KeyItemDto } from './key-item.dto';

export class ListKeysResponseDto {
    @ApiProperty({ type: [KeyItemDto] })
    items!: KeyItemDto[];
}
