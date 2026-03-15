import { Inject, Injectable } from '@nestjs/common';
import {
    BillingProvider,
    InvoiceStatus,
    Prisma,
    ProductStatus,
    Role,
    SubscriptionStatus,
    VersionStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CancelSubscriptionResponseDto } from './dto/cancel-subscription-response.dto';
import { BillingPortalSessionResponseDto } from './dto/billing-portal-session-response.dto';
import { BillingConfigResponseDto } from './dto/billing-config-response.dto';
import { CheckoutStatusDto } from './dto/checkout-status.dto';
import { SubscriptionListResponseDto } from './dto/list-subscriptions.dto';
import { SubscribeResponseDto } from './dto/subscribe-response.dto';
import { SubscriptionDto } from './dto/subscription.dto';
import { MockPaymentProvider } from './payment/mock-payment.provider';
import { PAYMENT_PROVIDER } from './payment/payment.provider';
import type {
    BillingProviderName,
    PaymentProvider,
} from './payment/payment.provider';
import { StripePaymentProvider } from './payment/stripe-payment.provider';

@Injectable()
export class SubscriptionsService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject(PAYMENT_PROVIDER)
        private readonly activePaymentProvider: PaymentProvider,
        private readonly mockPaymentProvider: MockPaymentProvider,
        private readonly stripePaymentProvider: StripePaymentProvider,
    ) {}

    async listUserSubscriptions(
        user: AuthenticatedUser,
    ): Promise<SubscriptionListResponseDto> {
        const subscriptions = await this.prisma.subscription.findMany({
            where: { userId: user.id },
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                status: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                cancelAtPeriodEnd: true,
                paymentProvider: true,
                externalSubscriptionId: true,
                createdAt: true,
                updatedAt: true,
                invoices: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 5,
                },
                plan: {
                    select: {
                        id: true,
                        name: true,
                        priceCents: true,
                        currency: true,
                        quotaRequests: true,
                        productId: true,
                        product: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                    },
                },
            },
        });

        const items: SubscriptionDto[] = subscriptions.map((subscription) => {
            const invoices = subscription.invoices.map((invoice) => ({
                id: invoice.id,
                status: invoice.status,
                amountCents: invoice.amountCents,
                currency: invoice.currency,
                createdAt: invoice.createdAt,
            }));

            return {
                id: subscription.id,
                status: subscription.status,
                currentPeriodStart: subscription.currentPeriodStart,
                currentPeriodEnd: subscription.currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                paymentProvider: subscription.paymentProvider,
                hasExternalSubscription: Boolean(
                    subscription.externalSubscriptionId,
                ),
                createdAt: subscription.createdAt,
                updatedAt: subscription.updatedAt,
                plan: {
                    id: subscription.plan.id,
                    name: subscription.plan.name,
                    priceCents: subscription.plan.priceCents,
                    currency: subscription.plan.currency,
                    quotaRequests: subscription.plan.quotaRequests,
                    productId: subscription.plan.productId,
                },
                product: {
                    id: subscription.plan.product.id,
                    title: subscription.plan.product.title,
                },
                latestInvoice: invoices[0] ?? null,
                invoices,
            };
        });

        return { items };
    }
    async cancelSubscription(
        subscriptionId: string,
        user: AuthenticatedUser,
    ): Promise<CancelSubscriptionResponseDto> {
        const subscription = await this.prisma.subscription.findUnique({
            where: { id: subscriptionId },
            select: {
                id: true,
                userId: true,
                cancelAtPeriodEnd: true,
                paymentProvider: true,
                externalSubscriptionId: true,
            },
        });

        if (!subscription) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_FOUND,
                message: 'SUBSCRIPTION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (user.role !== Role.ADMIN && subscription.userId !== user.id) {
            throw new AppError({
                code: ErrorCodes.NOT_OWNER,
                message: 'NOT_OWNER',
                httpStatus: 403,
            });
        }

        let currentPeriodEnd: Date | null | undefined;
        if (
            subscription.paymentProvider === BillingProvider.STRIPE &&
            subscription.externalSubscriptionId
        ) {
            const result = await this.getProviderForStoredSubscription(
                subscription.paymentProvider,
            ).scheduleSubscriptionCancelAtPeriodEnd({
                externalSubscriptionId: subscription.externalSubscriptionId,
            });
            currentPeriodEnd = result.currentPeriodEnd;
        }

        await this.prisma.subscription.update({
            where: { id: subscriptionId },
            data: {
                cancelAtPeriodEnd: true,
                ...(currentPeriodEnd !== undefined ? { currentPeriodEnd } : {}),
            },
        });

        return { ok: true, subscriptionId: subscription.id };
    }

    async createPortalSession(
        user: AuthenticatedUser,
    ): Promise<BillingPortalSessionResponseDto> {
        return this.activePaymentProvider.createCustomerPortalSession({
            userId: user.id,
            userEmail: user.email,
        });
    }

    getBillingConfig(): BillingConfigResponseDto {
        return {
            paymentProvider: this.activePaymentProvider.provider,
            customerPortalAvailable:
                this.activePaymentProvider.provider === 'STRIPE',
        };
    }

    async getCheckoutStatus(
        sessionId: string,
        user: AuthenticatedUser,
    ): Promise<CheckoutStatusDto> {
        const invoice = await this.prisma.invoice.findFirst({
            where: {
                externalCheckoutSessionId: sessionId,
                subscription: {
                    userId: user.id,
                },
            },
            include: {
                subscription: {
                    select: {
                        id: true,
                        status: true,
                        cancelAtPeriodEnd: true,
                        paymentProvider: true,
                        plan: {
                            select: {
                                name: true,
                                product: {
                                    select: {
                                        title: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!invoice) {
            throw new AppError({
                code: ErrorCodes.CHECKOUT_SESSION_NOT_FOUND,
                message: 'CHECKOUT_SESSION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        return {
            sessionId,
            invoiceId: invoice.id,
            invoiceStatus: invoice.status,
            subscriptionId: invoice.subscription.id,
            subscriptionStatus: invoice.subscription.status,
            cancelAtPeriodEnd: invoice.subscription.cancelAtPeriodEnd,
            paymentProvider: invoice.subscription.paymentProvider,
            productTitle: invoice.subscription.plan.product.title,
            planName: invoice.subscription.plan.name,
        };
    }

    async subscribe(
        planId: string,
        user: AuthenticatedUser,
    ): Promise<SubscribeResponseDto> {
        const plan = await this.prisma.plan.findUnique({
            where: { id: planId },
            select: {
                id: true,
                productId: true,
                name: true,
                priceCents: true,
                currency: true,
                isActive: true,
                product: {
                    select: {
                        title: true,
                        status: true,
                    },
                },
            },
        });

        if (!plan) {
            throw new AppError({
                code: ErrorCodes.PLAN_NOT_FOUND,
                message: 'PLAN_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (!plan.isActive) {
            throw new AppError({
                code: ErrorCodes.PLAN_INACTIVE,
                message: 'PLAN_INACTIVE',
                httpStatus: 400,
            });
        }

        if (plan.product.status !== ProductStatus.PUBLISHED) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_PUBLIC,
                message: 'PRODUCT_NOT_PUBLIC',
                httpStatus: 403,
            });
        }

        const publishedVersion = await this.prisma.apiVersion.findFirst({
            where: {
                productId: plan.productId,
                status: VersionStatus.PUBLISHED,
            },
            select: { id: true },
        });

        if (!publishedVersion) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_READY,
                message: 'PRODUCT_NOT_READY',
                httpStatus: 409,
            });
        }

        const { periodStart, periodEnd } = this.getInvoicePeriod();

        const { subscriptionId, invoiceId } = await this.prisma.$transaction(
            async (tx) => {
                await tx.$executeRaw`
                    SELECT pg_advisory_xact_lock(hashtext(${`subscribe:${user.id}:${plan.productId}`}))
                `;

                const existingSubscription = await tx.subscription.findFirst({
                    where: {
                        userId: user.id,
                        status: {
                            in: [
                                SubscriptionStatus.ACTIVE,
                                SubscriptionStatus.PENDING,
                            ],
                        },
                        plan: {
                            productId: plan.productId,
                        },
                    },
                    select: {
                        id: true,
                        status: true,
                    },
                });

                if (existingSubscription) {
                    throw new AppError({
                        code:
                            existingSubscription.status ===
                            SubscriptionStatus.ACTIVE
                                ? ErrorCodes.ALREADY_SUBSCRIBED
                                : ErrorCodes.SUBSCRIPTION_PENDING,
                        message:
                            existingSubscription.status ===
                            SubscriptionStatus.ACTIVE
                                ? 'ALREADY_SUBSCRIBED'
                                : 'SUBSCRIPTION_PENDING',
                        httpStatus: 409,
                    });
                }

                const subscription = await tx.subscription.create({
                    data: {
                        userId: user.id,
                        planId: plan.id,
                        paymentProvider: this.toPrismaPaymentProvider(
                            this.activePaymentProvider.provider,
                        ),
                        status: SubscriptionStatus.PENDING,
                        currentPeriodStart: null,
                        currentPeriodEnd: null,
                        cancelAtPeriodEnd: false,
                    },
                    select: { id: true },
                });

                const invoice = await tx.invoice.create({
                    data: {
                        subscriptionId: subscription.id,
                        paymentProvider: this.toPrismaPaymentProvider(
                            this.activePaymentProvider.provider,
                        ),
                        amountCents: plan.priceCents,
                        currency: plan.currency,
                        status: InvoiceStatus.DRAFT,
                        periodStart,
                        periodEnd,
                    },
                    select: { id: true },
                });

                return {
                    subscriptionId: subscription.id,
                    invoiceId: invoice.id,
                };
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            },
        );

        try {
            const payment = await this.activePaymentProvider.createPayment({
                invoiceId,
                subscriptionId,
                userId: user.id,
                userEmail: user.email,
                planId: plan.id,
                planName: plan.name,
                productTitle: plan.product.title,
                amountCents: plan.priceCents,
                currency: plan.currency,
            });

            if (payment.externalPaymentId) {
                await this.prisma.invoice.update({
                    where: { id: invoiceId },
                    data: {
                        externalCheckoutSessionId: payment.externalPaymentId,
                    },
                });
            }

            return {
                subscriptionId,
                invoiceId,
                paymentLink: payment.paymentLink,
            };
        } catch (error) {
            await this.markInvoiceFailed({
                invoiceId,
                paymentProvider: this.activePaymentProvider.provider,
            });
            throw error;
        }
    }

    async mockSucceed(invoiceId: string): Promise<{ ok: true }> {
        await this.markInvoicePaid({
            invoiceId,
            paymentProvider: 'MOCK',
        });

        return { ok: true };
    }

    async mockFail(invoiceId: string): Promise<{ ok: true }> {
        await this.markInvoiceFailed({
            invoiceId,
            paymentProvider: 'MOCK',
        });

        return { ok: true };
    }

    async recordExternalCheckout(params: {
        invoiceId: string;
        paymentProvider: BillingProviderName;
        externalCheckoutSessionId?: string;
        externalSubscriptionId?: string;
    }): Promise<{ ok: true }> {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: params.invoiceId },
            select: {
                id: true,
                externalCheckoutSessionId: true,
                subscription: {
                    select: {
                        id: true,
                        externalSubscriptionId: true,
                    },
                },
            },
        });

        if (!invoice) {
            throw new AppError({
                code: ErrorCodes.INVOICE_NOT_FOUND,
                message: 'INVOICE_NOT_FOUND',
                httpStatus: 404,
            });
        }

        await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                paymentProvider: this.toPrismaPaymentProvider(
                    params.paymentProvider,
                ),
                externalCheckoutSessionId:
                    params.externalCheckoutSessionId ??
                    invoice.externalCheckoutSessionId,
            },
        });

        if (params.externalSubscriptionId) {
            await this.prisma.subscription.update({
                where: { id: invoice.subscription.id },
                data: {
                    paymentProvider: this.toPrismaPaymentProvider(
                        params.paymentProvider,
                    ),
                    externalSubscriptionId:
                        params.externalSubscriptionId ??
                        invoice.subscription.externalSubscriptionId,
                },
            });
        }

        return { ok: true };
    }

    async syncInvoiceFromExternal(params: {
        paymentProvider: BillingProviderName;
        externalInvoiceId: string;
        externalSubscriptionId?: string;
        externalCheckoutSessionId?: string;
        metadataInvoiceId?: string;
        allowMetadataInvoiceId?: boolean;
        amountCents: number;
        currency: string;
        periodStart: Date;
        periodEnd: Date;
        status: InvoiceStatus;
    }): Promise<{ ok: true; invoiceId: string }> {
        const invoiceId = await this.resolveInvoiceForExternalSync(params);

        if (params.status === InvoiceStatus.DRAFT) {
            await this.prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                    paymentProvider: this.toPrismaPaymentProvider(
                        params.paymentProvider,
                    ),
                    externalCheckoutSessionId: params.externalCheckoutSessionId,
                    externalInvoiceId: params.externalInvoiceId,
                    amountCents: params.amountCents,
                    currency: params.currency,
                    status: InvoiceStatus.DRAFT,
                    periodStart: params.periodStart,
                    periodEnd: params.periodEnd,
                },
            });

            return { ok: true, invoiceId };
        }

        if (params.status === InvoiceStatus.PAID) {
            await this.markInvoicePaid({
                invoiceId,
                paymentProvider: params.paymentProvider,
                externalCheckoutSessionId: params.externalCheckoutSessionId,
                externalInvoiceId: params.externalInvoiceId,
                externalSubscriptionId: params.externalSubscriptionId,
            });

            return { ok: true, invoiceId };
        }

        await this.markInvoiceFailed({
            invoiceId,
            paymentProvider: params.paymentProvider,
            externalCheckoutSessionId: params.externalCheckoutSessionId,
            externalInvoiceId: params.externalInvoiceId,
            externalSubscriptionId: params.externalSubscriptionId,
        });

        return { ok: true, invoiceId };
    }

    async markInvoicePaid(params: {
        invoiceId: string;
        paymentProvider: BillingProviderName;
        externalCheckoutSessionId?: string;
        externalInvoiceId?: string;
        externalSubscriptionId?: string;
    }): Promise<{ ok: true; ignored?: true }> {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: params.invoiceId },
            select: {
                id: true,
                status: true,
                externalCheckoutSessionId: true,
                externalInvoiceId: true,
                periodStart: true,
                periodEnd: true,
                subscription: {
                    select: {
                        id: true,
                        externalSubscriptionId: true,
                    },
                },
            },
        });

        if (!invoice) {
            throw new AppError({
                code: ErrorCodes.INVOICE_NOT_FOUND,
                message: 'INVOICE_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (
            invoice.status === InvoiceStatus.PAID &&
            invoice.externalInvoiceId &&
            params.externalInvoiceId &&
            invoice.externalInvoiceId !== params.externalInvoiceId
        ) {
            return { ok: true, ignored: true };
        }

        await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                status: InvoiceStatus.PAID,
                paymentProvider: this.toPrismaPaymentProvider(
                    params.paymentProvider,
                ),
                externalCheckoutSessionId:
                    params.externalCheckoutSessionId ??
                    invoice.externalCheckoutSessionId,
                externalInvoiceId:
                    params.externalInvoiceId ?? invoice.externalInvoiceId,
            },
        });

        await this.prisma.subscription.update({
            where: { id: invoice.subscription.id },
            data: {
                status: SubscriptionStatus.ACTIVE,
                paymentProvider: this.toPrismaPaymentProvider(
                    params.paymentProvider,
                ),
                externalSubscriptionId:
                    params.externalSubscriptionId ??
                    invoice.subscription.externalSubscriptionId,
                currentPeriodStart: invoice.periodStart,
                currentPeriodEnd: invoice.periodEnd,
            },
        });

        return { ok: true };
    }

    async markInvoiceFailed(params: {
        invoiceId: string;
        paymentProvider: BillingProviderName;
        externalCheckoutSessionId?: string;
        externalInvoiceId?: string;
        externalSubscriptionId?: string;
    }): Promise<{ ok: true; ignored?: true }> {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: params.invoiceId },
            select: {
                id: true,
                status: true,
                externalInvoiceId: true,
                externalCheckoutSessionId: true,
                subscription: {
                    select: {
                        id: true,
                        status: true,
                        externalSubscriptionId: true,
                    },
                },
            },
        });

        if (!invoice) {
            throw new AppError({
                code: ErrorCodes.INVOICE_NOT_FOUND,
                message: 'INVOICE_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (
            invoice.status === InvoiceStatus.PAID &&
            invoice.externalInvoiceId &&
            params.externalInvoiceId &&
            invoice.externalInvoiceId !== params.externalInvoiceId
        ) {
            return { ok: true, ignored: true };
        }

        if (invoice.status !== InvoiceStatus.VOID) {
            await this.prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                    status: InvoiceStatus.VOID,
                    paymentProvider: this.toPrismaPaymentProvider(
                        params.paymentProvider,
                    ),
                    externalCheckoutSessionId:
                        params.externalCheckoutSessionId ??
                        invoice.externalCheckoutSessionId,
                    externalInvoiceId:
                        params.externalInvoiceId ?? invoice.externalInvoiceId,
                },
            });
        }

        await this.prisma.subscription.update({
            where: { id: invoice.subscription.id },
            data: {
                paymentProvider: this.toPrismaPaymentProvider(
                    params.paymentProvider,
                ),
                externalSubscriptionId:
                    params.externalSubscriptionId ??
                    invoice.subscription.externalSubscriptionId,
                ...(invoice.subscription.status !== SubscriptionStatus.ACTIVE
                    ? { status: SubscriptionStatus.PAST_DUE }
                    : {}),
            },
        });

        return { ok: true };
    }

    async markSubscriptionCanceledByExternalId(
        externalSubscriptionId: string,
    ): Promise<{ ok: true }> {
        const subscription = await this.prisma.subscription.findUnique({
            where: { externalSubscriptionId },
            select: { id: true },
        });

        if (!subscription) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_FOUND,
                message: 'SUBSCRIPTION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                status: SubscriptionStatus.CANCELED,
                cancelAtPeriodEnd: false,
            },
        });

        return { ok: true };
    }

    async syncSubscriptionFromExternal(params: {
        externalSubscriptionId: string;
        cancelAtPeriodEnd: boolean;
        status?: SubscriptionStatus;
        currentPeriodStart?: Date | null;
        currentPeriodEnd?: Date | null;
    }): Promise<{ ok: true }> {
        const subscription = await this.prisma.subscription.findUnique({
            where: { externalSubscriptionId: params.externalSubscriptionId },
            select: { id: true },
        });

        if (!subscription) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_FOUND,
                message: 'SUBSCRIPTION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                cancelAtPeriodEnd: params.cancelAtPeriodEnd,
                ...(params.status ? { status: params.status } : {}),
                ...(params.currentPeriodStart !== undefined
                    ? { currentPeriodStart: params.currentPeriodStart }
                    : {}),
                ...(params.currentPeriodEnd !== undefined
                    ? { currentPeriodEnd: params.currentPeriodEnd }
                    : {}),
            },
        });

        return { ok: true };
    }

    private getInvoicePeriod(): { periodStart: Date; periodEnd: Date } {
        const periodStart = new Date();
        const periodEnd = new Date(periodStart);
        periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

        return { periodStart, periodEnd };
    }

    private toPrismaPaymentProvider(
        paymentProvider: BillingProviderName,
    ): BillingProvider {
        return paymentProvider === 'STRIPE'
            ? BillingProvider.STRIPE
            : BillingProvider.MOCK;
    }

    private getProviderForStoredSubscription(
        paymentProvider: BillingProvider,
    ): PaymentProvider {
        return paymentProvider === BillingProvider.STRIPE
            ? this.stripePaymentProvider
            : this.mockPaymentProvider;
    }

    private async resolveInvoiceForExternalSync(params: {
        paymentProvider: BillingProviderName;
        externalInvoiceId: string;
        externalSubscriptionId?: string;
        externalCheckoutSessionId?: string;
        metadataInvoiceId?: string;
        allowMetadataInvoiceId?: boolean;
        amountCents: number;
        currency: string;
        periodStart: Date;
        periodEnd: Date;
        status: InvoiceStatus;
    }): Promise<string> {
        const invoiceByExternalId = await this.prisma.invoice.findUnique({
            where: { externalInvoiceId: params.externalInvoiceId },
            select: { id: true },
        });

        if (invoiceByExternalId) {
            return invoiceByExternalId.id;
        }

        if (params.allowMetadataInvoiceId && params.metadataInvoiceId) {
            const invoiceByMetadataId = await this.prisma.invoice.findUnique({
                where: { id: params.metadataInvoiceId },
                select: {
                    id: true,
                    externalInvoiceId: true,
                },
            });

            if (
                invoiceByMetadataId &&
                (!invoiceByMetadataId.externalInvoiceId ||
                    invoiceByMetadataId.externalInvoiceId ===
                        params.externalInvoiceId)
            ) {
                return invoiceByMetadataId.id;
            }
        }

        if (!params.externalSubscriptionId) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_FOUND,
                message: 'SUBSCRIPTION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const subscription = await this.prisma.subscription.findUnique({
            where: {
                externalSubscriptionId: params.externalSubscriptionId,
            },
            select: { id: true },
        });

        if (!subscription) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_FOUND,
                message: 'SUBSCRIPTION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const invoice = await this.prisma.invoice.create({
            data: {
                subscriptionId: subscription.id,
                paymentProvider: this.toPrismaPaymentProvider(
                    params.paymentProvider,
                ),
                externalCheckoutSessionId: params.externalCheckoutSessionId,
                externalInvoiceId: params.externalInvoiceId,
                amountCents: params.amountCents,
                currency: params.currency,
                status: InvoiceStatus.DRAFT,
                periodStart: params.periodStart,
                periodEnd: params.periodEnd,
            },
            select: {
                id: true,
            },
        });

        return invoice.id;
    }
}
