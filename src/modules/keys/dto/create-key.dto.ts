import { ApiProperty } from '@nestjs/swagger';

export class CreateKeyDto {
    @ApiProperty({ example: 'My key', minLength: 1, maxLength: 60 })
    label!: string;
}
