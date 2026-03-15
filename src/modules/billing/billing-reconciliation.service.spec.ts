import { InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import { AppConfigService } from '../../common/config/config.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StripeClientService } from './payment/stripe-client.service';
import { BillingReconciliationService } from './billing-reconciliation.service';
import { SubscriptionsService } from './subscriptions.service';

describe('BillingReconciliationService', () => {
    let service: BillingReconciliationService;
    let prisma: {
        subscription: {
            findMany: jest.Mock;
        };
    };
    let configService: Pick<
        AppConfigService,
        | 'paymentProvider'
        | 'billingReconciliationEnabled'
        | 'billingReconciliationIntervalSeconds'
        | 'billingReconciliationBatchSize'
    >;
    let stripeClientService: {
        client: {
            subscriptions: {
                retrieve: jest.Mock;
            };
            invoices: {
                retrieve: jest.Mock;
            };
        };
    };
    let subscriptionsService: {
        syncSubscriptionFromExternal: jest.Mock;
        syncInvoiceFromExternal: jest.Mock;
        markSubscriptionCanceledByExternalId: jest.Mock;
    };

    beforeEach(() => {
        prisma = {
            subscription: {
                findMany: jest.fn(),
            },
        };
        configService = {
            paymentProvider: 'STRIPE',
            billingReconciliationEnabled: true,
            billingReconciliationIntervalSeconds: 300,
            billingReconciliationBatchSize: 25,
        };
        stripeClientService = {
            client: {
                subscriptions: {
                    retrieve: jest.fn(),
                },
                invoices: {
                    retrieve: jest.fn(),
                },
            },
        };
        subscriptionsService = {
            syncSubscriptionFromExternal: jest
                .fn()
                .mockResolvedValue({ ok: true }),
            syncInvoiceFromExternal: jest.fn().mockResolvedValue({
                ok: true,
                invoiceId: 'inv-1',
            }),
            markSubscriptionCanceledByExternalId: jest
                .fn()
                .mockResolvedValue({ ok: true }),
        };

        service = new BillingReconciliationService(
            prisma as unknown as PrismaService,
            configService as AppConfigService,
            stripeClientService as unknown as StripeClientService,
            subscriptionsService as unknown as SubscriptionsService,
        );
    });

    it('reconciles Stripe past due subscriptions and retry metadata', async () => {
        prisma.subscription.findMany.mockResolvedValue([
            {
                externalSubscriptionId: 'sub_123',
            },
        ]);
        stripeClientService.client.subscriptions.retrieve.mockResolvedValue({
            id: 'sub_123',
            status: 'past_due',
            cancel_at_period_end: false,
            metadata: {},
            latest_invoice: {
                id: 'in_123',
                status: 'open',
                billing_reason: 'subscription_cycle',
                total: 4900,
                currency: 'usd',
                attempt_count: 2,
                next_payment_attempt: 1778701575,
                period_start: 1775936775,
                period_end: 1778615175,
                parent: {
                    subscription_details: {
                        metadata: {},
                    },
                },
            },
            items: {
                data: [
                    {
                        current_period_start: 1775936775,
                        current_period_end: 1778615175,
                    },
                ],
            },
        } as unknown as Stripe.Subscription);

        const result = await service.reconcileStripeState();

        expect(
            subscriptionsService.syncSubscriptionFromExternal,
        ).toHaveBeenCalledWith({
            externalSubscriptionId: 'sub_123',
            cancelAtPeriodEnd: false,
            status: SubscriptionStatus.PAST_DUE,
            currentPeriodStart: new Date(1775936775 * 1000),
            currentPeriodEnd: new Date(1778615175 * 1000),
        });
        expect(
            subscriptionsService.syncInvoiceFromExternal,
        ).toHaveBeenCalledWith({
            paymentProvider: 'STRIPE',
            externalInvoiceId: 'in_123',
            externalSubscriptionId: 'sub_123',
            metadataInvoiceId: undefined,
            allowMetadataInvoiceId: false,
            amountCents: 4900,
            currency: 'USD',
            periodStart: new Date(1775936775 * 1000),
            periodEnd: new Date(1778615175 * 1000),
            status: InvoiceStatus.PAST_DUE,
            attemptCount: 2,
            nextPaymentAttemptAt: new Date(1778701575 * 1000),
        });
        expect(result).toEqual({
            processed: 1,
            failed: 0,
        });
    });

    it('marks missing Stripe subscriptions as canceled during reconciliation', async () => {
        prisma.subscription.findMany.mockResolvedValue([
            {
                externalSubscriptionId: 'sub_missing',
            },
        ]);
        stripeClientService.client.subscriptions.retrieve.mockRejectedValue({
            type: 'StripeInvalidRequestError',
            code: 'resource_missing',
        });

        const result = await service.reconcileStripeState();

        expect(
            subscriptionsService.markSubscriptionCanceledByExternalId,
        ).toHaveBeenCalledWith('sub_missing');
        expect(result).toEqual({
            processed: 1,
            failed: 0,
        });
    });
});
