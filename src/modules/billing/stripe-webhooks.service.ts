import { Injectable } from '@nestjs/common';
import { InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { StripeClientService } from './payment/stripe-client.service';
import { extractStripeSubscriptionPeriod } from './stripe-subscription-period';
import { SubscriptionsService } from './subscriptions.service';

const IGNORED_NOT_FOUND_CODES = new Set<string>([
    ErrorCodes.INVOICE_NOT_FOUND,
    ErrorCodes.SUBSCRIPTION_NOT_FOUND,
]);

@Injectable()
export class StripeWebhooksService {
    constructor(
        private readonly stripeClientService: StripeClientService,
        private readonly subscriptionsService: SubscriptionsService,
    ) {}

    async handleWebhook(
        rawBody: Buffer | undefined,
        signatureHeader: string | undefined,
    ): Promise<{ received: true }> {
        if (!rawBody || !signatureHeader) {
            throw new AppError({
                code: ErrorCodes.STRIPE_WEBHOOK_INVALID,
                message: 'STRIPE_WEBHOOK_INVALID',
                httpStatus: 400,
            });
        }

        const event = this.stripeClientService.constructWebhookEvent(
            rawBody,
            signatureHeader,
        );

        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutCompleted(event.data.object);
                break;
            case 'checkout.session.expired':
                await this.handleCheckoutExpired(event.data.object);
                break;
            case 'invoice.created':
            case 'invoice.finalized':
                await this.handleInvoiceDraft(event.data.object);
                break;
            case 'invoice.paid':
                await this.handleInvoicePaid(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this.handleInvoiceFailed(event.data.object);
                break;
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object);
                break;
            default:
                break;
        }

        return { received: true };
    }

    private async handleCheckoutCompleted(
        session: Stripe.Checkout.Session,
    ): Promise<void> {
        const invoiceId = session.metadata?.invoiceId;
        if (!invoiceId) {
            return;
        }

        try {
            await this.subscriptionsService.recordExternalCheckout({
                invoiceId,
                paymentProvider: 'STRIPE',
                externalCheckoutSessionId: session.id,
                externalSubscriptionId:
                    typeof session.subscription === 'string'
                        ? session.subscription
                        : undefined,
            });
        } catch (error) {
            this.ignoreNotFound(error);
        }
    }

    private async handleCheckoutExpired(
        session: Stripe.Checkout.Session,
    ): Promise<void> {
        const invoiceId = session.metadata?.invoiceId;
        if (!invoiceId) {
            return;
        }

        try {
            await this.subscriptionsService.markInvoiceFailed({
                invoiceId,
                paymentProvider: 'STRIPE',
                externalCheckoutSessionId: session.id,
                externalSubscriptionId:
                    typeof session.subscription === 'string'
                        ? session.subscription
                        : undefined,
            });
        } catch (error) {
            this.ignoreNotFound(error);
        }
    }

    private async handleInvoiceDraft(invoice: Stripe.Invoice): Promise<void> {
        await this.syncInvoice(invoice, InvoiceStatus.DRAFT);
    }

    private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
        await this.syncInvoice(invoice, InvoiceStatus.PAID);
    }

    private async handleInvoiceFailed(invoice: Stripe.Invoice): Promise<void> {
        await this.syncInvoice(invoice, InvoiceStatus.VOID);
    }

    private async syncInvoice(
        invoice: Stripe.Invoice,
        status: InvoiceStatus,
    ): Promise<void> {
        const invoiceDetails = this.extractInvoiceSubscriptionDetails(invoice);
        const externalSubscriptionId =
            typeof invoiceDetails?.subscription === 'string'
                ? invoiceDetails.subscription
                : undefined;
        const allowMetadataInvoiceId =
            this.shouldAllowMetadataInvoiceId(invoice);
        const metadata =
            invoiceDetails?.metadata ??
            (allowMetadataInvoiceId
                ? await this.resolveSubscriptionMetadata(externalSubscriptionId)
                : null);

        try {
            await this.subscriptionsService.syncInvoiceFromExternal({
                paymentProvider: 'STRIPE',
                externalInvoiceId: invoice.id,
                externalSubscriptionId,
                metadataInvoiceId: metadata?.invoiceId,
                allowMetadataInvoiceId,
                amountCents: invoice.total,
                currency: invoice.currency.toUpperCase(),
                periodStart: new Date(invoice.period_start * 1000),
                periodEnd: new Date(invoice.period_end * 1000),
                status,
            });
        } catch (error) {
            this.ignoreNotFound(error);
        }
    }

    private async handleSubscriptionDeleted(
        subscription: Stripe.Subscription,
    ): Promise<void> {
        try {
            await this.subscriptionsService.markSubscriptionCanceledByExternalId(
                subscription.id,
            );
        } catch (error) {
            this.ignoreNotFound(error);
        }
    }

    private async handleSubscriptionUpdated(
        subscription: Stripe.Subscription,
    ): Promise<void> {
        const period = extractStripeSubscriptionPeriod(subscription);

        try {
            await this.subscriptionsService.syncSubscriptionFromExternal({
                externalSubscriptionId: subscription.id,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
                status: this.mapStripeSubscriptionStatus(subscription.status),
                currentPeriodStart: period.currentPeriodStart,
                currentPeriodEnd: period.currentPeriodEnd,
            });
        } catch (error) {
            this.ignoreNotFound(error);
        }
    }

    private async resolveSubscriptionMetadata(
        externalSubscriptionId: string | undefined,
    ): Promise<Record<string, string> | null> {
        if (!externalSubscriptionId) {
            return null;
        }

        const subscription =
            await this.stripeClientService.client.subscriptions.retrieve(
                externalSubscriptionId,
            );

        return subscription.metadata ?? null;
    }

    private extractInvoiceSubscriptionDetails(
        invoice: Stripe.Invoice,
    ): Stripe.Invoice.Parent.SubscriptionDetails | null {
        return invoice.parent?.subscription_details ?? null;
    }

    private shouldAllowMetadataInvoiceId(invoice: Stripe.Invoice): boolean {
        return (
            invoice.billing_reason === 'subscription' ||
            invoice.billing_reason === 'subscription_create'
        );
    }

    private ignoreNotFound(error: unknown): void {
        if (
            error instanceof AppError &&
            IGNORED_NOT_FOUND_CODES.has(error.code)
        ) {
            return;
        }

        throw error;
    }

    private mapStripeSubscriptionStatus(
        status: Stripe.Subscription.Status,
    ): SubscriptionStatus {
        if (status === 'active' || status === 'trialing') {
            return SubscriptionStatus.ACTIVE;
        }

        if (status === 'canceled') {
            return SubscriptionStatus.CANCELED;
        }

        if (status === 'past_due' || status === 'unpaid') {
            return SubscriptionStatus.PAST_DUE;
        }

        return SubscriptionStatus.PENDING;
    }
}
