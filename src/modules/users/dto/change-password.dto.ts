import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
    @ApiProperty({ minLength: 1 })
    currentPassword!: string;

    @ApiProperty({ minLength: 8 })
    newPassword!: string;
}

export class ChangePasswordResponseDto {
    @ApiProperty({ example: true })
    ok!: true;
}
