import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../common/config/env.schema';
import { AppError } from '../../../common/errors/app.error';
import { ErrorCodes } from '../../../common/errors/error.codes';
import type {
    CreateCustomerPortalSessionParams,
    CreateCustomerPortalSessionResult,
    CreatePaymentParams,
    CreatePaymentResult,
    PaymentProvider,
    ScheduleSubscriptionCancelParams,
    ScheduleSubscriptionCancelResult,
} from './payment.provider';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
    readonly provider = 'MOCK' as const;

    constructor(private readonly configService: ConfigService<Env, true>) {}

    createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
        const port = this.configService.getOrThrow<number>('PORT');
        return Promise.resolve({
            paymentLink: `http://localhost:${port}/billing/mock/pay?invoiceId=${params.invoiceId}`,
            provider: this.provider,
        });
    }

    createCustomerPortalSession(
        params: CreateCustomerPortalSessionParams,
    ): Promise<CreateCustomerPortalSessionResult> {
        void params;
        throw new AppError({
            code: ErrorCodes.PAYMENT_PROVIDER_NOT_ENABLED,
            message: 'PAYMENT_PROVIDER_NOT_ENABLED',
            httpStatus: 400,
        });
    }

    scheduleSubscriptionCancelAtPeriodEnd(
        params: ScheduleSubscriptionCancelParams,
    ): Promise<ScheduleSubscriptionCancelResult> {
        void params;
        return Promise.resolve({
            cancelAtPeriodEnd: true,
        });
    }
}
