import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterDto {
    @ApiProperty({ example: 'user@example.com' })
    email!: string;

    @ApiProperty({ minLength: 8 })
    password!: string;

    @ApiProperty({
        enum: [Role.BUYER, Role.SELLER],
        required: false,
        default: Role.BUYER,
    })
    role?: 'BUYER' | 'SELLER';
}
