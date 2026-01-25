import { ApiProperty } from '@nestjs/swagger';

export class RevokeKeyResponseDto {
    @ApiProperty({ example: true })
    ok!: boolean;

    @ApiProperty({ example: 'uuid' })
    keyId!: string;
}
