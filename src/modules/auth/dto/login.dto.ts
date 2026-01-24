import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({ example: 'user@example.com' })
    email!: string;

    @ApiProperty({ minLength: 1 })
    password!: string;
}
