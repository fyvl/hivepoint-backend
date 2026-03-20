import { ApiProperty } from '@nestjs/swagger';
import { AuditLogItemDto } from './audit-log-item.dto';

export class ListAuditLogsResponseDto {
    @ApiProperty({ type: [AuditLogItemDto] })
    items!: AuditLogItemDto[];
}
