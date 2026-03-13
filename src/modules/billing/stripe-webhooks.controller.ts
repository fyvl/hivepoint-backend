import { Controller, Headers, Post, RawBody } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { StripeWebhooksService } from './stripe-webhooks.service';

@ApiExcludeController()
@Controller('billing/stripe')
export class StripeWebhooksController {
    constructor(
        private readonly stripeWebhooksService: StripeWebhooksService,
    ) {}

    @Post('webhook')
    async handleWebhook(
        @RawBody() rawBody: Buffer | undefined,
        @Headers('stripe-signature') signatureHeader: string | undefined,
    ): Promise<{ received: true }> {
        return this.stripeWebhooksService.handleWebhook(
            rawBody,
            signatureHeader,
        );
    }
}
