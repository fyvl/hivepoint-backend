import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogService } from './audit-log.service';
import { HttpMetricsService } from './http-metrics.service';
import { MetricsController } from './metrics.controller';
import { OperationalAlertDeliveryService } from './operational-alert-delivery.service';
import { OperationalMonitoringService } from './operational-monitoring.service';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
    imports: [PrismaModule],
    controllers: [MetricsController],
    providers: [
        RequestContextService,
        AuditLogService,
        HttpMetricsService,
        OperationalAlertDeliveryService,
        OperationalMonitoringService,
    ],
    exports: [
        RequestContextService,
        AuditLogService,
        HttpMetricsService,
        OperationalAlertDeliveryService,
        OperationalMonitoringService,
    ],
})
export class ObservabilityModule {}
