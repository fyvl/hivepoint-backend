import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/config.module';
import { HealthModule } from './common/health/health.module';
import { OpenApiModule } from './common/openapi/openapi.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
    imports: [
        AppConfigModule,
        PrismaModule,
        HealthModule,
        OpenApiModule,
        AuthModule,
        UsersModule,
    ],
})
export class AppModule {}
