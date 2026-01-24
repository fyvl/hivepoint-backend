import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class AuthUserResponseDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'user@example.com' })
    email!: string;

    @ApiProperty({ enum: Role })
    role!: Role;
}

export class AccessTokenResponseDto {
    @ApiProperty()
    accessToken!: string;
}

export class LogoutResponseDto {
    @ApiProperty({ example: true })
    ok!: boolean;
}
