import { InvoiceStatus, Role, SubscriptionStatus } from '@prisma/client';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PaymentProvider } from './payment/payment.provider';
import { SubscriptionsService } from './subscriptions.service';

type PrismaMock = {
    plan: {
        findUnique: jest.Mock;
    };
    apiProduct: {
        findUnique: jest.Mock;
    };
    subscription: {
        findFirst: jest.Mock;
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
    };
    invoice: {
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
    };
    $transaction: jest.Mock;
};

describe('SubscriptionsService', () => {
    let service: SubscriptionsService;
    let prisma: PrismaMock;
    let paymentProvider: jest.Mocked<PaymentProvider>;

    beforeEach(() => {
        prisma = {
            plan: {
                findUnique: jest.fn(),
            },
            apiProduct: {
                findUnique: jest.fn(),
            },
            subscription: {
                findFirst: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            invoice: {
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            $transaction: jest.fn(async (callback) => callback(prisma)),
        };

        paymentProvider = {
            createPayment: jest.fn(),
        };

        service = new SubscriptionsService(
            prisma as unknown as PrismaService,
            paymentProvider,
        );
    });

    it('subscribe creates pending subscription and draft invoice', async () => {
        prisma.plan.findUnique.mockResolvedValue({
            id: 'plan-1',
            productId: 'product-1',
            priceCents: 1000,
            currency: 'EUR',
            isActive: true,
        });
        prisma.apiProduct.findUnique.mockResolvedValue({ id: 'product-1' });
        prisma.subscription.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
        prisma.subscription.create.mockResolvedValue({ id: 'sub-1' });
        prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
        paymentProvider.createPayment.mockResolvedValue({
            paymentLink: 'http://localhost:3000/billing/mock/pay?invoiceId=inv-1',
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
                    status: SubscriptionStatus.PENDING,
                    cancelAtPeriodEnd: false,
                }),
            }),
        );
        expect(prisma.invoice.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: InvoiceStatus.DRAFT,
                    amountCents: 1000,
                }),
            }),
        );
        expect(result).toEqual({
            subscriptionId: 'sub-1',
            invoiceId: 'inv-1',
            paymentLink: 'http://localhost:3000/billing/mock/pay?invoiceId=inv-1',
        });
    });

    it('subscribe fails when active subscription exists', async () => {
        prisma.plan.findUnique.mockResolvedValue({
            id: 'plan-1',
            productId: 'product-1',
            priceCents: 1000,
            currency: 'EUR',
            isActive: true,
        });
        prisma.apiProduct.findUnique.mockResolvedValue({ id: 'product-1' });
        prisma.subscription.findFirst.mockResolvedValueOnce({ id: 'active-sub' });

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        await expect(service.subscribe('plan-1', user)).rejects.toMatchObject({
            code: ErrorCodes.ALREADY_SUBSCRIBED,
        });
    });

    it('mock succeed activates subscription and sets period', async () => {
        const periodStart = new Date('2026-01-01T00:00:00.000Z');
        const periodEnd = new Date('2026-02-01T00:00:00.000Z');

        prisma.invoice.findUnique.mockResolvedValue({
            id: 'inv-1',
            status: InvoiceStatus.DRAFT,
            periodStart,
            periodEnd,
            subscription: {
                id: 'sub-1',
            },
        });

        const result = await service.mockSucceed('inv-1');

        expect(prisma.invoice.update).toHaveBeenCalledWith({
            where: { id: 'inv-1' },
            data: { status: InvoiceStatus.PAID },
        });
        expect(prisma.subscription.update).toHaveBeenCalledWith({
            where: { id: 'sub-1' },
            data: {
                status: SubscriptionStatus.ACTIVE,
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
            subscription: {
                id: 'sub-1',
                status: SubscriptionStatus.PENDING,
            },
        });

        const result = await service.mockFail('inv-1');

        expect(prisma.invoice.update).toHaveBeenCalledWith({
            where: { id: 'inv-1' },
            data: { status: InvoiceStatus.VOID },
        });
        expect(prisma.subscription.update).toHaveBeenCalledWith({
            where: { id: 'sub-1' },
            data: { status: SubscriptionStatus.PAST_DUE },
        });
        expect(result.ok).toBe(true);
    });
});
