import { ApiProperty } from '@nestjs/swagger';

export class CreateKeyResponseDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'My key' })
    label!: string;

    @ApiProperty({ example: 'hp_b64url...' })
    rawKey!: string;

    @ApiProperty({ type: String, format: 'date-time' })
    createdAt!: Date;
}
