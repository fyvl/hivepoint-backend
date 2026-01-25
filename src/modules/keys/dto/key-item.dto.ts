import { ApiProperty } from '@nestjs/swagger';

export class KeyItemDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'My key' })
    label!: string;

    @ApiProperty({ example: true })
    isActive!: boolean;

    @ApiProperty({ type: String, format: 'date-time' })
    createdAt!: Date;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    revokedAt!: Date | null;
}
