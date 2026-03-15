import {
    BillingProvider,
    InvoiceStatus,
    ProductStatus,
    Role,
    SubscriptionStatus,
    VersionStatus,
} from '@prisma/client';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MockPaymentProvider } from './payment/mock-payment.provider';
import type { PaymentProvider } from './payment/payment.provider';
import { StripePaymentProvider } from './payment/stripe-payment.provider';
import { SubscriptionsService } from './subscriptions.service';

type PrismaMock = {
    plan: {
        findUnique: jest.Mock;
    };
    apiVersion: {
        findFirst: jest.Mock;
    };
    subscription: {
        findFirst: jest.Mock;
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
    };
    invoice: {
        findFirst?: jest.Mock;
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
    };
    $transaction: jest.Mock;
};

describe('SubscriptionsService', () => {
    let service: SubscriptionsService;
    let prisma: PrismaMock;
    let activePaymentProvider: jest.Mocked<PaymentProvider>;
    let mockPaymentProvider: jest.Mocked<PaymentProvider>;
    let stripePaymentProvider: jest.Mocked<PaymentProvider>;
    let txExecuteRaw: jest.Mock;

    beforeEach(() => {
        txExecuteRaw = jest.fn();
        prisma = {
            plan: {
                findUnique: jest.fn(),
            },
            apiVersion: {
                findFirst: jest.fn(),
            },
            subscription: {
                findFirst: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            invoice: {
                findFirst: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            $transaction: jest.fn(async (callback) =>
                callback({
                    ...prisma,
                    $executeRaw: txExecuteRaw,
                }),
            ),
        };

        activePaymentProvider = {
            provider: 'MOCK',
            createCustomerPortalSession: jest.fn(),
            createPayment: jest.fn(),
            scheduleSubscriptionCancelAtPeriodEnd: jest.fn(),
        };
        mockPaymentProvider = {
            provider: 'MOCK',
            createCustomerPortalSession: jest.fn(),
            createPayment: jest.fn(),
            scheduleSubscriptionCancelAtPeriodEnd: jest.fn(),
        };
        stripePaymentProvider = {
            provider: 'STRIPE',
            createCustomerPortalSession: jest.fn(),
            createPayment: jest.fn(),
            scheduleSubscriptionCancelAtPeriodEnd: jest.fn(),
        };

        service = new SubscriptionsService(
            prisma as unknown as PrismaService,
            activePaymentProvider,
            mockPaymentProvider as unknown as MockPaymentProvider,
            stripePaymentProvider as unknown as StripePaymentProvider,
        );
    });

    it('subscribe creates pending subscription and draft invoice', async () => {
        prisma.plan.findUnique.mockResolvedValue({
            id: 'plan-1',
            productId: 'product-1',
            name: 'Starter',
            priceCents: 1000,
            currency: 'EUR',
            isActive: true,
            product: {
                title: 'Payments API',
                status: ProductStatus.PUBLISHED,
            },
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            status: VersionStatus.PUBLISHED,
        });
        prisma.subscription.findFirst.mockResolvedValueOnce(null);
        prisma.subscription.create.mockResolvedValue({ id: 'sub-1' });
        prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
        activePaymentProvider.createPayment.mockResolvedValue({
            provider: 'MOCK',
            paymentLink:
                'http://localhost:3000/billing/mock/pay?invoiceId=inv-1',
        });

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        const result = await service.subscribe('plan-1', user);

        expect(prisma.subscription.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    paymentProvider: BillingProvider.MOCK,
                    status: SubscriptionStatus.PENDING,
                    cancelAtPeriodEnd: false,
                }),
            }),
        );
        expect(prisma.invoice.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    paymentProvider: BillingProvider.MOCK,
                    status: InvoiceStatus.DRAFT,
                    amountCents: 1000,
                }),
            }),
        );
        expect(result).toEqual({
            subscriptionId: 'sub-1',
            invoiceId: 'inv-1',
            paymentLink:
                'http://localhost:3000/billing/mock/pay?invoiceId=inv-1',
        });
    });

    it('subscribe fails when active subscription exists', async () => {
        prisma.plan.findUnique.mockResolvedValue({
            id: 'plan-1',
            productId: 'product-1',
            name: 'Starter',
            priceCents: 1000,
            currency: 'EUR',
            isActive: true,
            product: {
                title: 'Payments API',
                status: ProductStatus.PUBLISHED,
            },
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            status: VersionStatus.PUBLISHED,
        });
        prisma.subscription.findFirst.mockResolvedValueOnce({
            id: 'active-sub',
            status: SubscriptionStatus.ACTIVE,
        });

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        await expect(service.subscribe('plan-1', user)).rejects.toMatchObject({
            code: ErrorCodes.ALREADY_SUBSCRIBED,
        });
    });

    it('subscribe fails when product is not published', async () => {
        prisma.plan.findUnique.mockResolvedValue({
            id: 'plan-1',
            productId: 'product-1',
            name: 'Starter',
            priceCents: 1000,
            currency: 'EUR',
            isActive: true,
            product: {
                title: 'Payments API',
                status: ProductStatus.DRAFT,
            },
        });

        await expect(
            service.subscribe('plan-1', {
                id: 'user-1',
                email: 'user@example.com',
                role: Role.BUYER,
            }),
        ).rejects.toMatchObject({
            code: ErrorCodes.PRODUCT_NOT_PUBLIC,
        });
    });

    it('subscribe fails when there is no published version', async () => {
        prisma.plan.findUnique.mockResolvedValue({
            id: 'plan-1',
            productId: 'product-1',
            name: 'Starter',
            priceCents: 1000,
            currency: 'EUR',
            isActive: true,
            product: {
                title: 'Payments API',
                status: ProductStatus.PUBLISHED,
            },
        });
        prisma.apiVersion.findFirst.mockResolvedValue(null);

        await expect(
            service.subscribe('plan-1', {
                id: 'user-1',
                email: 'user@example.com',
                role: Role.BUYER,
            }),
        ).rejects.toMatchObject({
            code: ErrorCodes.PRODUCT_NOT_READY,
        });
    });

    it('create portal session delegates to active payment provider', async () => {
        activePaymentProvider.createCustomerPortalSession.mockResolvedValue({
            url: 'https://billing.stripe.com/session/test',
        });

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        const result = await service.createPortalSession(user);

        expect(
            activePaymentProvider.createCustomerPortalSession.mock
                .calls[0]?.[0],
        ).toEqual({
            userId: 'user-1',
            userEmail: 'user@example.com',
        });
        expect(result).toEqual({
            url: 'https://billing.stripe.com/session/test',
        });
    });

    it('exposes billing config from active payment provider', () => {
        expect(service.getBillingConfig()).toEqual({
            paymentProvider: 'MOCK',
            customerPortalAvailable: false,
        });
    });

    it('returns checkout status for current user and session id', async () => {
        prisma.invoice.findFirst = jest.fn().mockResolvedValue({
            id: 'inv-1',
            status: InvoiceStatus.PAID,
            subscription: {
                id: 'sub-1',
                status: SubscriptionStatus.ACTIVE,
                cancelAtPeriodEnd: false,
                paymentProvider: BillingProvider.STRIPE,
                plan: {
                    name: 'Starter',
                    product: {
                        title: 'Payments API',
                    },
                },
            },
        });

        const result = await service.getCheckoutStatus('cs_test_123', {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        });

        expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    externalCheckoutSessionId: 'cs_test_123',
                    subscription: {
                        userId: 'user-1',
                    },
                },
            }),
        );
        expect(result).toEqual({
            sessionId: 'cs_test_123',
            invoiceId: 'inv-1',
            invoiceStatus: InvoiceStatus.PAID,
            subscriptionId: 'sub-1',
            subscriptionStatus: SubscriptionStatus.ACTIVE,
            cancelAtPeriodEnd: false,
            paymentProvider: BillingProvider.STRIPE,
            productTitle: 'Payments API',
            planName: 'Starter',
        });
    });

    it('mock succeed activates subscription and sets period', async () => {
        const periodStart = new Date('2026-01-01T00:00:00.000Z');
        const periodEnd = new Date('2026-02-01T00:00:00.000Z');

        prisma.invoice.findUnique.mockResolvedValue({
            id: 'inv-1',
            status: InvoiceStatus.DRAFT,
            externalCheckoutSessionId: null,
            externalInvoiceId: null,
            periodStart,
            periodEnd,
            subscription: {
                id: 'sub-1',
                externalSubscriptionId: null,
            },
        });

        const result = await service.mockSucceed('inv-1');

        expect(prisma.invoice.update).toHaveBeenCalledWith({
            where: { id: 'inv-1' },
            data: {
                status: InvoiceStatus.PAID,
                paymentProvider: BillingProvider.MOCK,
                externalCheckoutSessionId: null,
                externalInvoiceId: null,
            },
        });
        expect(prisma.subscription.update).toHaveBeenCalledWith({
            where: { id: 'sub-1' },
            data: {
                status: SubscriptionStatus.ACTIVE,
                paymentProvider: BillingProvider.MOCK,
                externalSubscriptionId: null,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
            },
        });
        expect(result.ok).toBe(true);
    });

    it('mock fail voids invoice and marks subscription past due', async () => {
        prisma.invoice.findUnique.mockResolvedValue({
            id: 'inv-1',
            status: InvoiceStatus.DRAFT,
            externalCheckoutSessionId: null,
            externalInvoiceId: null,
            subscription: {
                id: 'sub-1',
                status: SubscriptionStatus.PENDING,
                externalSubscriptionId: null,
            },
        });

        const result = await service.mockFail('inv-1');

        expect(prisma.invoice.update).toHaveBeenCalledWith({
            where: { id: 'inv-1' },
            data: {
                status: InvoiceStatus.VOID,
                paymentProvider: BillingProvider.MOCK,
                externalCheckoutSessionId: null,
                externalInvoiceId: null,
            },
        });
        expect(prisma.subscription.update).toHaveBeenCalledWith({
            where: { id: 'sub-1' },
            data: {
                paymentProvider: BillingProvider.MOCK,
                externalSubscriptionId: null,
                status: SubscriptionStatus.PAST_DUE,
            },
        });
        expect(result.ok).toBe(true);
    });

    it('syncs cancel at period end with active payment provider', async () => {
        prisma.subscription.findUnique.mockResolvedValue({
            id: 'sub-1',
            userId: 'user-1',
            cancelAtPeriodEnd: false,
            paymentProvider: BillingProvider.STRIPE,
            externalSubscriptionId: 'sub_ext_1',
        });
        stripePaymentProvider.scheduleSubscriptionCancelAtPeriodEnd.mockResolvedValue(
            {
                cancelAtPeriodEnd: true,
                currentPeriodEnd: new Date('2026-04-12T19:46:15.030Z'),
            },
        );

        const result = await service.cancelSubscription('sub-1', {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        });

        expect(
            stripePaymentProvider.scheduleSubscriptionCancelAtPeriodEnd.mock
                .calls[0]?.[0],
        ).toEqual({
            externalSubscriptionId: 'sub_ext_1',
        });
        expect(prisma.subscription.update).toHaveBeenCalledWith({
            where: { id: 'sub-1' },
            data: {
                cancelAtPeriodEnd: true,
                currentPeriodEnd: new Date('2026-04-12T19:46:15.030Z'),
            },
        });
        expect(result).toEqual({
            ok: true,
            subscriptionId: 'sub-1',
        });
    });

    it('creates and pays recurring external invoice for an active Stripe subscription', async () => {
        const periodStart = new Date('2026-04-12T19:49:57.000Z');
        const periodEnd = new Date('2026-05-12T19:49:57.000Z');

        prisma.invoice.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                id: 'inv-renew-1',
                status: InvoiceStatus.DRAFT,
                externalCheckoutSessionId: null,
                externalInvoiceId: 'in_renew_1',
                periodStart,
                periodEnd,
                subscription: {
                    id: 'sub-1',
                    externalSubscriptionId: 'sub_ext_1',
                },
            });
        prisma.subscription.findUnique.mockResolvedValueOnce({
            id: 'sub-1',
        });
        prisma.invoice.create.mockResolvedValue({
            id: 'inv-renew-1',
        });

        const result = await service.syncInvoiceFromExternal({
            paymentProvider: 'STRIPE',
            externalInvoiceId: 'in_renew_1',
            externalSubscriptionId: 'sub_ext_1',
            amountCents: 4900,
            currency: 'USD',
            periodStart,
            periodEnd,
            status: InvoiceStatus.PAID,
        });

        expect(prisma.invoice.create).toHaveBeenCalledWith({
            data: {
                subscriptionId: 'sub-1',
                paymentProvider: BillingProvider.STRIPE,
                externalCheckoutSessionId: undefined,
                externalInvoiceId: 'in_renew_1',
                amountCents: 4900,
                currency: 'USD',
                status: InvoiceStatus.DRAFT,
                periodStart,
                periodEnd,
            },
            select: {
                id: true,
            },
        });
        expect(prisma.invoice.update).toHaveBeenCalledWith({
            where: { id: 'inv-renew-1' },
            data: {
                status: InvoiceStatus.PAID,
                paymentProvider: BillingProvider.STRIPE,
                externalCheckoutSessionId: null,
                externalInvoiceId: 'in_renew_1',
            },
        });
        expect(prisma.subscription.update).toHaveBeenCalledWith({
            where: { id: 'sub-1' },
            data: {
                status: SubscriptionStatus.ACTIVE,
                paymentProvider: BillingProvider.STRIPE,
                externalSubscriptionId: 'sub_ext_1',
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
            },
        });
        expect(result).toEqual({
            ok: true,
            invoiceId: 'inv-renew-1',
        });
    });
});
