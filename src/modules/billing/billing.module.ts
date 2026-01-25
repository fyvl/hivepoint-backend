import { Module } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
    imports: [PrismaModule],
    controllers: [PlansController, SubscriptionsController],
    providers: [PlansService, SubscriptionsService, JwtGuard, RolesGuard],
})
export class BillingModule {}
