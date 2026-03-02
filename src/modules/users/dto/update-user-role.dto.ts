import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UpdateUserRoleDto {
    @ApiProperty({ enum: [Role.SELLER], default: Role.SELLER })
    role!: 'SELLER';
}
