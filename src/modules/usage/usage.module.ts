import { Module } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { UsageAggregationService } from './usage-aggregation.service';
import { UsageController } from './usage.controller';
import { UsageIngestWorkerService } from './usage-ingest-worker.service';
import { UsageService } from './usage.service';

@Module({
    imports: [PrismaModule],
    controllers: [UsageController],
    providers: [
        UsageAggregationService,
        UsageService,
        UsageIngestWorkerService,
        JwtGuard,
    ],
    exports: [UsageService],
})
export class UsageModule {}
