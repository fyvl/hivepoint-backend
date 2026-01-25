import { ApiProperty } from '@nestjs/swagger';

export class RecordUsageResponseDto {
    @ApiProperty({ example: true })
    ok!: boolean;
}
