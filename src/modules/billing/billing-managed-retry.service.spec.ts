import { InvoiceStatus } from '@prisma/client';
import { AppConfigService } from '../../common/config/config.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingManagedRetryService } from './billing-managed-retry.service';
import { StripePaymentProvider } from './payment/stripe-payment.provider';
import { SubscriptionsService } from './subscriptions.service';

describe('BillingManagedRetryService', () => {
    let service: BillingManagedRetryService;
    let prisma: {
        backgroundJobLease: {
            findUnique: jest.Mock;
            create: jest.Mock;
            updateMany: jest.Mock;
        };
        invoice: {
            findMany: jest.Mock;
            update: jest.Mock;
        };
        $transaction: jest.Mock;
    };
    let configService: Pick<
        AppConfigService,
        | 'paymentProvider'
        | 'billingManagedRetryEnabled'
        | 'billingManagedRetryIntervalSeconds'
        | 'billingManagedRetryBatchSize'
        | 'billingManagedRetryDelaysMinutes'
    >;
    let stripePaymentProvider: {
        retryInvoicePayment: jest.Mock;
    };
    let subscriptionsService: {
        markInvoicePaid: jest.Mock;
        markInvoiceFailed: jest.Mock;
    };

    beforeEach(() => {
        prisma = {
            backgroundJobLease: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({}),
                updateMany: jest.fn(),
            },
            invoice: {
                findMany: jest.fn(),
                update: jest.fn().mockResolvedValue({}),
            },
            $transaction: jest.fn(async (callback) =>
                callback({
                    ...prisma,
                }),
            ),
        };
        configService = {
            paymentProvider: 'STRIPE',
            billingManagedRetryEnabled: true,
            billingManagedRetryIntervalSeconds: 60,
            billingManagedRetryBatchSize: 25,
            billingManagedRetryDelaysMinutes: [60, 360, 1440],
        };
        stripePaymentProvider = {
            retryInvoicePayment: jest.fn(),
        };
        subscriptionsService = {
            markInvoicePaid: jest.fn().mockResolvedValue({ ok: true }),
            markInvoiceFailed: jest.fn().mockResolvedValue({ ok: true }),
        };

        service = new BillingManagedRetryService(
            prisma as unknown as PrismaService,
            configService as AppConfigService,
            stripePaymentProvider as unknown as StripePaymentProvider,
            subscriptionsService as unknown as SubscriptionsService,
        );
    });

    it('retries due past-due renewal invoices and reschedules them on failure', async () => {
        prisma.invoice.findMany.mockResolvedValue([
            {
                id: 'inv-1',
                externalInvoiceId: 'in_123',
                managedRetryCount: 0,
            },
        ]);
        stripePaymentProvider.retryInvoicePayment.mockResolvedValue({
            externalInvoiceId: 'in_123',
            externalSubscriptionId: 'sub_123',
            amountCents: 4900,
            currency: 'USD',
            periodStart: new Date('2026-04-12T19:49:57.000Z'),
            periodEnd: new Date('2026-05-12T19:49:57.000Z'),
            status: 'PAST_DUE',
            attemptCount: 3,
            nextPaymentAttemptAt: new Date('2026-05-13T10:00:00.000Z'),
        });

        const result = await service.processDueRetries();

        expect(subscriptionsService.markInvoiceFailed).toHaveBeenCalledWith({
            invoiceId: 'inv-1',
            paymentProvider: 'STRIPE',
            externalInvoiceId: 'in_123',
            externalSubscriptionId: 'sub_123',
            invoiceStatus: InvoiceStatus.PAST_DUE,
            attemptCount: 3,
            nextPaymentAttemptAt: new Date('2026-05-13T10:00:00.000Z'),
        });
        expect(prisma.invoice.update).toHaveBeenCalledWith({
            where: {
                id: 'inv-1',
            },
            data: expect.objectContaining({
                managedRetryCount: 1,
                managedNextRetryAt: expect.any(Date),
                managedLastRetryAt: expect.any(Date),
                managedRetryExhaustedAt: null,
                managedLastRetryError: null,
            }),
        });
        expect(result).toEqual({
            processed: 1,
            failed: 0,
        });
    });

    it('marks invoices paid when a managed retry succeeds', async () => {
        prisma.invoice.findMany.mockResolvedValue([
            {
                id: 'inv-1',
                externalInvoiceId: 'in_123',
                managedRetryCount: 1,
            },
        ]);
        stripePaymentProvider.retryInvoicePayment.mockResolvedValue({
            externalInvoiceId: 'in_123',
            externalSubscriptionId: 'sub_123',
            amountCents: 4900,
            currency: 'USD',
            periodStart: new Date('2026-04-12T19:49:57.000Z'),
            periodEnd: new Date('2026-05-12T19:49:57.000Z'),
            status: 'PAID',
            attemptCount: 3,
            nextPaymentAttemptAt: null,
        });

        const result = await service.processDueRetries();

        expect(subscriptionsService.markInvoicePaid).toHaveBeenCalledWith({
            invoiceId: 'inv-1',
            paymentProvider: 'STRIPE',
            externalInvoiceId: 'in_123',
            externalSubscriptionId: 'sub_123',
            attemptCount: 3,
        });
        expect(prisma.invoice.update).not.toHaveBeenCalled();
        expect(result).toEqual({
            processed: 1,
            failed: 0,
        });
    });

    it('records retry execution errors and advances the retry schedule', async () => {
        prisma.invoice.findMany.mockResolvedValue([
            {
                id: 'inv-1',
                externalInvoiceId: 'in_123',
                managedRetryCount: 2,
            },
        ]);
        stripePaymentProvider.retryInvoicePayment.mockRejectedValue(
            new Error('temporary stripe failure'),
        );

        const result = await service.processDueRetries();

        expect(subscriptionsService.markInvoiceFailed).not.toHaveBeenCalled();
        expect(prisma.invoice.update).toHaveBeenCalledWith({
            where: {
                id: 'inv-1',
            },
            data: expect.objectContaining({
                managedRetryCount: 3,
                managedNextRetryAt: null,
                managedLastRetryAt: expect.any(Date),
                managedRetryExhaustedAt: expect.any(Date),
                managedLastRetryError: 'temporary stripe failure',
            }),
        });
        expect(result).toEqual({
            processed: 0,
            failed: 1,
        });
    });

    it('skips work when another instance holds the lease', async () => {
        prisma.backgroundJobLease.findUnique.mockResolvedValue({
            ownerId: 'other-instance',
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        });

        const result = await service.processDueRetries();

        expect(prisma.invoice.findMany).not.toHaveBeenCalled();
        expect(
            stripePaymentProvider.retryInvoicePayment,
        ).not.toHaveBeenCalled();
        expect(result).toEqual({
            processed: 0,
            failed: 0,
        });
    });

    it('treats retryable lease transaction conflicts as a skipped cycle', async () => {
        prisma.$transaction.mockRejectedValue({
            code: 'P2034',
        });

        const result = await service.processDueRetries();

        expect(prisma.invoice.findMany).not.toHaveBeenCalled();
        expect(result).toEqual({
            processed: 0,
            failed: 0,
        });
    });
});
