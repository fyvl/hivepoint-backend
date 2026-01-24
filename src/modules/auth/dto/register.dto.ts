import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
    @ApiProperty({ example: 'user@example.com' })
    email!: string;

    @ApiProperty({ minLength: 8 })
    password!: string;
}
