import { ApiProperty } from '@nestjs/swagger';

export class HideVersionResponseDto {
    @ApiProperty({ example: true })
    ok!: boolean;

    @ApiProperty({ example: 'uuid' })
    versionId!: string;
}
