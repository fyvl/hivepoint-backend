import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../common/config/env.schema';
import type { PaymentProvider } from './payment.provider';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
    constructor(private readonly configService: ConfigService<Env, true>) {}

    async createPayment(params: {
        invoiceId: string;
        amountCents: number;
        currency: string;
    }): Promise<{ paymentLink: string }> {
        const port = this.configService.getOrThrow('PORT');
        return {
            paymentLink: `http://localhost:${port}/billing/mock/pay?invoiceId=${params.invoiceId}`,
        };
    }
}
