import { ApiProperty } from '@nestjs/swagger';

export class SubscribeDto {
    @ApiProperty({ example: 'uuid' })
    planId!: string;
}
