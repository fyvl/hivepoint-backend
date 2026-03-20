import { ErrorCodes } from '../../../common/errors/error.codes';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppConfigService } from '../../../common/config/config.service';
import { StripeClientService } from './stripe-client.service';
import { StripePaymentProvider } from './stripe-payment.provider';

describe('StripePaymentProvider', () => {
    const prisma = {
        user: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
    } as unknown as PrismaService;

    const configService = {
        stripeCheckoutSuccessUrl: 'http://localhost:5173/billing/success',
        stripeCheckoutCancelUrl: 'http://localhost:5173/billing/cancel',
        stripePortalReturnUrl: 'http://localhost:5173/billing',
    } as AppConfigService;

    const stripeClientService = {
        client: {
            checkout: {
                sessions: {
                    create: jest.fn(),
                },
            },
            customers: {
                create: jest.fn(),
            },
            billingPortal: {
                sessions: {
                    create: jest.fn(),
                },
            },
            subscriptions: {
                update: jest.fn(),
                retrieve: jest.fn(),
            },
            invoiceItems: {
                create: jest.fn(),
            },
            invoices: {
                create: jest.fn(),
                finalizeInvoice: jest.fn(),
                pay: jest.fn(),
                retrieve: jest.fn(),
            },
        },
    } as unknown as StripeClientService;

    let provider: StripePaymentProvider;

    beforeEach(() => {
        jest.resetAllMocks();
        provider = new StripePaymentProvider(
            prisma,
            configService,
            stripeClientService,
        );
    });

    it('maps Stripe currency conflicts to a 409 AppError', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'user@example.com',
            stripeCustomerId: 'cus_existing',
        });
        stripeClientService.client.checkout.sessions.create = jest
            .fn()
            .mockRejectedValue({
                type: 'StripeInvalidRequestError',
                message:
                    'You cannot combine currencies on a single customer. This customer has an active subscription with currency usd.',
            });

        await expect(
            provider.createPayment({
                invoiceId: 'inv-1',
                subscriptionId: 'sub-1',
                userId: 'user-1',
                userEmail: 'user@example.com',
                planId: 'plan-1',
                planName: 'Starter',
                productTitle: 'Demo API',
                amountCents: 1000,
                currency: 'EUR',
            }),
        ).rejects.toMatchObject({
            code: ErrorCodes.CONFLICT,
            httpStatus: 409,
            message:
                'Stripe customer already has billing activity in another currency. Use a fresh account or a plan with the same currency.',
            details: {
                customerId: 'cus_existing',
                requestedCurrency: 'EUR',
            },
        });
    });

    it('builds Stripe success_url with a literal checkout session placeholder', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'user@example.com',
            stripeCustomerId: 'cus_existing',
        });
        stripeClientService.client.checkout.sessions.create = jest
            .fn()
            .mockResolvedValue({
                id: 'cs_test_123',
                url: 'https://checkout.stripe.com/pay/cs_test_123',
            });

        await provider.createPayment({
            invoiceId: 'inv-1',
            subscriptionId: 'sub-1',
            userId: 'user-1',
            userEmail: 'user@example.com',
            planId: 'plan-1',
            planName: 'Starter',
            productTitle: 'Demo API',
            amountCents: 1000,
            currency: 'EUR',
        });

        expect(
            stripeClientService.client.checkout.sessions.create.mock
                .calls[0]?.[0]?.success_url,
        ).toBe(
            'http://localhost:5173/billing/success?session_id={CHECKOUT_SESSION_ID}',
        );
    });

    it('creates setup-mode Checkout sessions for zero-price Stripe plans', async () => {
        prisma.user.findUnique = jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'user@example.com',
            stripeCustomerId: 'cus_existing',
        });
        stripeClientService.client.checkout.sessions.create = jest
            .fn()
            .mockResolvedValue({
                id: 'cs_setup_123',
                url: 'https://checkout.stripe.com/pay/cs_setup_123',
            });

        await provider.createPayment({
            invoiceId: 'inv-1',
            subscriptionId: 'sub-1',
            userId: 'user-1',
            userEmail: 'user@example.com',
            planId: 'plan-1',
            planName: 'PayGo',
            productTitle: 'Demo API',
            amountCents: 0,
            currency: 'EUR',
            setupOnly: true,
        });

        expect(
            stripeClientService.client.checkout.sessions.create.mock
                .calls[0]?.[0],
        ).toEqual(
            expect.objectContaining({
                mode: 'setup',
                customer: 'cus_existing',
                client_reference_id: 'inv-1',
            }),
        );
        expect(
            stripeClientService.client.checkout.sessions.create.mock
                .calls[0]?.[0]?.line_items,
        ).toBeUndefined();
        expect(
            stripeClientService.client.checkout.sessions.create.mock
                .calls[0]?.[0]?.subscription_data,
        ).toBeUndefined();
    });

    it('creates and pays managed Stripe invoices for overage collection', async () => {
        stripeClientService.client.subscriptions.retrieve = jest
            .fn()
            .mockResolvedValue({
                customer: 'cus_existing',
            });
        stripeClientService.client.invoiceItems.create = jest
            .fn()
            .mockResolvedValue({
                id: 'ii_1',
            });
        stripeClientService.client.invoices.create = jest
            .fn()
            .mockResolvedValue({
                id: 'in_overage_1',
                status: 'draft',
                total: 400,
                currency: 'eur',
                attempt_count: 0,
                next_payment_attempt: null,
                period_start: 1773344775,
                period_end: 1775936775,
                parent: {
                    subscription_details: {
                        subscription: 'sub_ext_1',
                    },
                },
            });
        stripeClientService.client.invoices.finalizeInvoice = jest
            .fn()
            .mockResolvedValue({
                id: 'in_overage_1',
                status: 'open',
                total: 400,
                currency: 'eur',
                attempt_count: 1,
                next_payment_attempt: 1776023175,
                period_start: 1773344775,
                period_end: 1775936775,
                parent: {
                    subscription_details: {
                        subscription: 'sub_ext_1',
                    },
                },
            });
        stripeClientService.client.invoices.pay = jest.fn().mockResolvedValue({
            id: 'in_overage_1',
            status: 'paid',
            total: 400,
            currency: 'eur',
            attempt_count: 1,
            next_payment_attempt: null,
            period_start: 1773344775,
            period_end: 1775936775,
            parent: {
                subscription_details: {
                    subscription: 'sub_ext_1',
                },
            },
        });

        const result = await provider.createManagedInvoice({
            invoiceId: 'inv-overage-1',
            externalSubscriptionId: 'sub_ext_1',
            userId: 'user-1',
            userEmail: 'user@example.com',
            amountCents: 400,
            currency: 'EUR',
            description: 'Overage charges for Demo API',
            periodStart: new Date(1773344775 * 1000),
            periodEnd: new Date(1775936775 * 1000),
        });

        expect(
            stripeClientService.client.invoiceItems.create,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                customer: 'cus_existing',
                subscription: 'sub_ext_1',
                amount: 400,
                currency: 'eur',
            }),
        );
        expect(stripeClientService.client.invoices.create).toHaveBeenCalledWith(
            expect.objectContaining({
                customer: 'cus_existing',
                subscription: 'sub_ext_1',
                auto_advance: false,
                collection_method: 'charge_automatically',
                metadata: expect.objectContaining({
                    invoiceId: 'inv-overage-1',
                }),
            }),
        );
        expect(result).toEqual({
            externalInvoiceId: 'in_overage_1',
            externalSubscriptionId: 'sub_ext_1',
            amountCents: 400,
            currency: 'EUR',
            periodStart: new Date(1773344775 * 1000),
            periodEnd: new Date(1775936775 * 1000),
            status: 'PAID',
            attemptCount: 1,
            nextPaymentAttemptAt: null,
        });
    });
});
