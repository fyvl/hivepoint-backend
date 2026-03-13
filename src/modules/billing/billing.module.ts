import { Module } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { MockPaymentGuard } from './guards/mock-payment.guard';
import { MockPaymentProvider } from './payment/mock-payment.provider';
import { PAYMENT_PROVIDER } from './payment/payment.provider';
import { StripeClientService } from './payment/stripe-client.service';
import { StripePaymentProvider } from './payment/stripe-payment.provider';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { MockPaymentsController } from './mock-payments.controller';
import { StripeWebhooksController } from './stripe-webhooks.controller';
import { StripeWebhooksService } from './stripe-webhooks.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
    imports: [PrismaModule],
    controllers: [
        PlansController,
        SubscriptionsController,
        MockPaymentsController,
        StripeWebhooksController,
    ],
    providers: [
        PlansService,
        SubscriptionsService,
        JwtGuard,
        RolesGuard,
        MockPaymentGuard,
        MockPaymentProvider,
        StripeClientService,
        StripePaymentProvider,
        StripeWebhooksService,
        {
            provide: PAYMENT_PROVIDER,
            inject: [
                AppConfigService,
                MockPaymentProvider,
                StripePaymentProvider,
            ],
            useFactory: (
                configService: AppConfigService,
                mockPaymentProvider: MockPaymentProvider,
                stripePaymentProvider: StripePaymentProvider,
            ) => {
                return configService.paymentProvider === 'STRIPE'
                    ? stripePaymentProvider
                    : mockPaymentProvider;
            },
        },
    ],
})
export class BillingModule {}
