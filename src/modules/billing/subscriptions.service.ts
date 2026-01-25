import { Inject, Injectable } from '@nestjs/common';
import { InvoiceStatus, Role, SubscriptionStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CancelSubscriptionResponseDto } from './dto/cancel-subscription-response.dto';
import { SubscriptionListResponseDto } from './dto/list-subscriptions.dto';
import { SubscribeResponseDto } from './dto/subscribe-response.dto';
import { SubscriptionDto } from './dto/subscription.dto';
import { PAYMENT_PROVIDER } from './payment/payment.provider';
import type { PaymentProvider } from './payment/payment.provider';

@Injectable()
export class SubscriptionsService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    ) {}

    async listUserSubscriptions(user: AuthenticatedUser): Promise<SubscriptionListResponseDto> {
        const subscriptions = await this.prisma.subscription.findMany({
            where: { userId: user.id },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
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

        const items: SubscriptionDto[] = subscriptions.map((subscription) => ({
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
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
        }));

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

        if (!subscription.cancelAtPeriodEnd) {
            await this.prisma.subscription.update({
                where: { id: subscriptionId },
                data: { cancelAtPeriodEnd: true },
            });
        }

        return { ok: true, subscriptionId: subscription.id };
    }

    async subscribe(planId: string, user: AuthenticatedUser): Promise<SubscribeResponseDto> {
        const plan = await this.prisma.plan.findUnique({
            where: { id: planId },
            select: {
                id: true,
                productId: true,
                priceCents: true,
                currency: true,
                isActive: true,
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

        const product = await this.prisma.apiProduct.findUnique({
            where: { id: plan.productId },
            select: { id: true },
        });

        if (!product) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_FOUND,
                message: 'PRODUCT_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const activeSubscription = await this.prisma.subscription.findFirst({
            where: {
                userId: user.id,
                status: SubscriptionStatus.ACTIVE,
                plan: {
                    productId: plan.productId,
                },
            },
            select: { id: true },
        });

        if (activeSubscription) {
            throw new AppError({
                code: ErrorCodes.ALREADY_SUBSCRIBED,
                message: 'ALREADY_SUBSCRIBED',
                httpStatus: 409,
            });
        }

        const pendingSubscription = await this.prisma.subscription.findFirst({
            where: {
                userId: user.id,
                status: SubscriptionStatus.PENDING,
                plan: {
                    productId: plan.productId,
                },
            },
            select: { id: true },
        });

        if (pendingSubscription) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_PENDING,
                message: 'SUBSCRIPTION_PENDING',
                httpStatus: 409,
            });
        }

        const { periodStart, periodEnd } = this.getInvoicePeriod();

        const { subscriptionId, invoiceId } = await this.prisma.$transaction(
            async (tx) => {
                const subscription = await tx.subscription.create({
                    data: {
                        userId: user.id,
                        planId: plan.id,
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
        );

        const payment = await this.paymentProvider.createPayment({
            invoiceId,
            amountCents: plan.priceCents,
            currency: plan.currency,
        });

        return {
            subscriptionId,
            invoiceId,
            paymentLink: payment.paymentLink,
        };
    }

    async mockSucceed(invoiceId: string): Promise<{ ok: true }> {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: invoiceId },
            select: {
                id: true,
                status: true,
                periodStart: true,
                periodEnd: true,
                subscription: {
                    select: {
                        id: true,
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

        if (invoice.status === InvoiceStatus.PAID) {
            return { ok: true };
        }

        await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: InvoiceStatus.PAID },
        });

        await this.prisma.subscription.update({
            where: { id: invoice.subscription.id },
            data: {
                status: SubscriptionStatus.ACTIVE,
                currentPeriodStart: invoice.periodStart,
                currentPeriodEnd: invoice.periodEnd,
            },
        });

        return { ok: true };
    }

    async mockFail(invoiceId: string): Promise<{ ok: true }> {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: invoiceId },
            select: {
                id: true,
                status: true,
                subscription: {
                    select: {
                        id: true,
                        status: true,
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

        if (invoice.status === InvoiceStatus.VOID) {
            return { ok: true };
        }

        await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: InvoiceStatus.VOID },
        });

        if (invoice.subscription.status !== SubscriptionStatus.ACTIVE) {
            await this.prisma.subscription.update({
                where: { id: invoice.subscription.id },
                data: { status: SubscriptionStatus.PAST_DUE },
            });
        }

        return { ok: true };
    }

    private getInvoicePeriod(): { periodStart: Date; periodEnd: Date } {
        const periodStart = new Date();
        const periodEnd = new Date(periodStart);
        periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

        return { periodStart, periodEnd };
    }
}
