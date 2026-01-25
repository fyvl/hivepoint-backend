import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserMeResponseDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'user@example.com' })
    email!: string;

    @ApiProperty({ enum: Role })
    role!: Role;
}
