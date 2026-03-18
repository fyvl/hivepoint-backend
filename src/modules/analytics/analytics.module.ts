import { Module } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
    imports: [PrismaModule],
    controllers: [AnalyticsController],
    providers: [AnalyticsService, JwtGuard, RolesGuard],
})
export class AnalyticsModule {}
