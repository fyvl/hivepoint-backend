import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class AuditLogItemDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'req_123', nullable: true })
    requestId!: string | null;

    @ApiProperty({ example: 'uuid', nullable: true })
    actorUserId!: string | null;

    @ApiProperty({ example: 'admin@example.com', nullable: true })
    actorEmail!: string | null;

    @ApiProperty({ enum: Role, nullable: true })
    actorRole!: Role | null;

    @ApiProperty({ example: 'ADMIN_HIDE_PRODUCT' })
    action!: string;

    @ApiProperty({ example: 'API_PRODUCT' })
    resourceType!: string;

    @ApiProperty({ example: 'uuid' })
    resourceId!: string;

    @ApiProperty({ type: Object, nullable: true })
    details!: unknown;

    @ApiProperty({ example: '2026-03-19T18:00:00.000Z' })
    createdAt!: Date;
}
