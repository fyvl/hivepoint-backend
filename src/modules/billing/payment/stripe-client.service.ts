import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { AppConfigService } from '../../../common/config/config.service';
import { AppError } from '../../../common/errors/app.error';
import { ErrorCodes } from '../../../common/errors/error.codes';

@Injectable()
export class StripeClientService {
    private stripeClient: Stripe | null = null;

    constructor(private readonly configService: AppConfigService) {}

    get client(): Stripe {
        const secretKey = this.configService.stripeSecretKey;
        if (!secretKey) {
            throw new AppError({
                code: ErrorCodes.PAYMENT_PROVIDER_NOT_ENABLED,
                message: 'PAYMENT_PROVIDER_NOT_ENABLED',
                httpStatus: 400,
            });
        }

        if (!this.stripeClient) {
            this.stripeClient = new Stripe(secretKey);
        }

        return this.stripeClient;
    }

    constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
        const webhookSecret = this.configService.stripeWebhookSecret;
        if (!webhookSecret) {
            throw new AppError({
                code: ErrorCodes.PAYMENT_PROVIDER_NOT_ENABLED,
                message: 'PAYMENT_PROVIDER_NOT_ENABLED',
                httpStatus: 400,
            });
        }

        try {
            return this.client.webhooks.constructEvent(
                rawBody,
                signature,
                webhookSecret,
            );
        } catch {
            throw new AppError({
                code: ErrorCodes.STRIPE_WEBHOOK_INVALID,
                message: 'STRIPE_WEBHOOK_INVALID',
                httpStatus: 400,
            });
        }
    }
}
