import { ApiProperty } from '@nestjs/swagger';
import { OperationalAlertSeverity } from '../../../common/observability/operational-monitoring.service';

export class OperationalAlertDto {
    @ApiProperty({ example: 'USAGE_INGEST_FAILED_JOBS' })
    kind!: string;

    @ApiProperty({ enum: OperationalAlertSeverity })
    severity!: OperationalAlertSeverity;

    @ApiProperty({ example: 'Usage ingest has failed jobs' })
    title!: string;

    @ApiProperty({
        example: '3 usage ingest job(s) are currently in FAILED state.',
    })
    message!: string;

    @ApiProperty({ type: Object, required: false })
    details?: Record<string, string | number | boolean | null>;
}

export class OperationalAlertsResponseDto {
    @ApiProperty({ type: [OperationalAlertDto] })
    items!: OperationalAlertDto[];
}
