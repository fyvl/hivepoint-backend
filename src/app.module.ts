import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/config.module';
import { HealthModule } from './common/health/health.module';
import { OpenApiModule } from './common/openapi/openapi.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { BillingModule } from './modules/billing/billing.module';
import { KeysModule } from './modules/keys/keys.module';
import { UsageModule } from './modules/usage/usage.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
    imports: [
        AppConfigModule,
        PrismaModule,
        HealthModule,
        OpenApiModule,
        AuthModule,
        UsersModule,
        CatalogModule,
        BillingModule,
        KeysModule,
        UsageModule,
        AdminModule,
    ],
})
export class AppModule {}
