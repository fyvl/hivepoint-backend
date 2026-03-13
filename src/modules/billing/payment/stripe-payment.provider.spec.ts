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
});
