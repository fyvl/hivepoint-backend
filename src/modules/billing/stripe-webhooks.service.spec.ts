import { InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import { ErrorCodes } from '../../common/errors/error.codes';
import { StripeClientService } from './payment/stripe-client.service';
import { StripeWebhooksService } from './stripe-webhooks.service';
import { SubscriptionsService } from './subscriptions.service';

describe('StripeWebhooksService', () => {
    let service: StripeWebhooksService;
    let stripeClientService: {
        constructWebhookEvent: jest.Mock;
        client: {
            subscriptions: {
                retrieve: jest.Mock;
            };
        };
    };
    let subscriptionsService: {
        recordExternalCheckout: jest.Mock;
        markInvoiceFailed: jest.Mock;
        syncInvoiceFromExternal: jest.Mock;
        syncSubscriptionFromExternal: jest.Mock;
        markSubscriptionCanceledByExternalId: jest.Mock;
    };

    beforeEach(() => {
        stripeClientService = {
            constructWebhookEvent: jest.fn(),
            client: {
                subscriptions: {
                    retrieve: jest.fn(),
                },
            },
        };

        subscriptionsService = {
            recordExternalCheckout: jest.fn().mockResolvedValue({ ok: true }),
            markInvoiceFailed: jest.fn().mockResolvedValue({ ok: true }),
            syncInvoiceFromExternal: jest.fn().mockResolvedValue({ ok: true }),
            syncSubscriptionFromExternal: jest
                .fn()
                .mockResolvedValue({ ok: true }),
            markSubscriptionCanceledByExternalId: jest
                .fn()
                .mockResolvedValue({ ok: true }),
        };

        service = new StripeWebhooksService(
            stripeClientService as unknown as StripeClientService,
            subscriptionsService as unknown as SubscriptionsService,
        );
    });

    it('rejects when raw body or signature is missing', async () => {
        await expect(
            service.handleWebhook(undefined, undefined),
        ).rejects.toMatchObject({
            code: ErrorCodes.STRIPE_WEBHOOK_INVALID,
        });
    });

    it('records checkout completion metadata', async () => {
        stripeClientService.constructWebhookEvent.mockReturnValue({
            type: 'checkout.session.completed',
            data: {
                object: {
                    id: 'cs_123',
                    metadata: {
                        invoiceId: 'inv-1',
                    },
                    subscription: 'sub_123',
                },
            },
        });

        await service.handleWebhook(Buffer.from('payload'), 'sig');

        expect(
            subscriptionsService.recordExternalCheckout,
        ).toHaveBeenCalledWith({
            invoiceId: 'inv-1',
            paymentProvider: 'STRIPE',
            externalCheckoutSessionId: 'cs_123',
            externalSubscriptionId: 'sub_123',
        });
    });

    it('marks invoice paid from invoice snapshot metadata', async () => {
        stripeClientService.constructWebhookEvent.mockReturnValue({
            type: 'invoice.paid',
            data: {
                object: {
                    id: 'in_123',
                    billing_reason: 'subscription_create',
                    total: 9900,
                    currency: 'usd',
                    period_start: 1773344775,
                    period_end: 1775936775,
                    parent: {
                        subscription_details: {
                            metadata: {
                                invoiceId: 'inv-1',
                            },
                            subscription: 'sub_123',
                        },
                    },
                },
            },
        });

        await service.handleWebhook(Buffer.from('payload'), 'sig');

        expect(
            subscriptionsService.syncInvoiceFromExternal,
        ).toHaveBeenCalledWith({
            paymentProvider: 'STRIPE',
            externalInvoiceId: 'in_123',
            externalSubscriptionId: 'sub_123',
            metadataInvoiceId: 'inv-1',
            allowMetadataInvoiceId: true,
            amountCents: 9900,
            currency: 'USD',
            periodStart: new Date(1773344775 * 1000),
            periodEnd: new Date(1775936775 * 1000),
            status: InvoiceStatus.PAID,
        });
        expect(
            stripeClientService.client.subscriptions.retrieve,
        ).not.toHaveBeenCalled();
    });

    it('syncs recurring subscription cycle invoice as local draft invoice', async () => {
        stripeClientService.constructWebhookEvent.mockReturnValue({
            type: 'invoice.created',
            data: {
                object: {
                    id: 'in_cycle_123',
                    billing_reason: 'subscription_cycle',
                    total: 4900,
                    currency: 'usd',
                    period_start: 1775936775,
                    period_end: 1778615175,
                    parent: {
                        subscription_details: {
                            metadata: {
                                invoiceId: 'inv-initial',
                            },
                            subscription: 'sub_123',
                        },
                    },
                },
            },
        });

        await service.handleWebhook(Buffer.from('payload'), 'sig');

        expect(
            subscriptionsService.syncInvoiceFromExternal,
        ).toHaveBeenCalledWith({
            paymentProvider: 'STRIPE',
            externalInvoiceId: 'in_cycle_123',
            externalSubscriptionId: 'sub_123',
            metadataInvoiceId: 'inv-initial',
            allowMetadataInvoiceId: false,
            amountCents: 4900,
            currency: 'USD',
            periodStart: new Date(1775936775 * 1000),
            periodEnd: new Date(1778615175 * 1000),
            status: InvoiceStatus.DRAFT,
        });
    });

    it('syncs cancel and period data from subscription updates', async () => {
        stripeClientService.constructWebhookEvent.mockReturnValue({
            type: 'customer.subscription.updated',
            data: {
                object: {
                    id: 'sub_123',
                    status: 'active',
                    cancel_at_period_end: true,
                    items: {
                        data: [
                            {
                                current_period_start: 1773344775,
                                current_period_end: 1775936775,
                            },
                        ],
                    },
                },
            },
        });

        await service.handleWebhook(Buffer.from('payload'), 'sig');

        expect(
            subscriptionsService.syncSubscriptionFromExternal,
        ).toHaveBeenCalledWith({
            externalSubscriptionId: 'sub_123',
            cancelAtPeriodEnd: true,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(1773344775 * 1000),
            currentPeriodEnd: new Date(1775936775 * 1000),
        });
    });
});
