import { Module } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { MockPaymentGuard } from './guards/mock-payment.guard';
import { MockPaymentProvider } from './payment/mock-payment.provider';
import { PAYMENT_PROVIDER } from './payment/payment.provider';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { MockPaymentsController } from './mock-payments.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
    imports: [PrismaModule],
    controllers: [PlansController, SubscriptionsController, MockPaymentsController],
    providers: [
        PlansService,
        SubscriptionsService,
        JwtGuard,
        RolesGuard,
        MockPaymentGuard,
        MockPaymentProvider,
        {
            provide: PAYMENT_PROVIDER,
            useExisting: MockPaymentProvider,
        },
    ],
})
export class BillingModule {}
