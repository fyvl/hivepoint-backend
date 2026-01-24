import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/config.module';
import { HealthModule } from './common/health/health.module';
import { OpenApiModule } from './common/openapi/openapi.module';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
    imports: [AppConfigModule, PrismaModule, HealthModule, OpenApiModule],
})
export class AppModule {}
