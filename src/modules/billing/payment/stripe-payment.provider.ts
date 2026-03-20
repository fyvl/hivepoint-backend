import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { AppConfigService } from '../../../common/config/config.service';
import { AppError } from '../../../common/errors/app.error';
import { ErrorCodes } from '../../../common/errors/error.codes';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
    CreateCustomerPortalSessionParams,
    CreateCustomerPortalSessionResult,
    CreateManagedInvoiceParams,
    CreatePaymentParams,
    CreatePaymentResult,
    PaymentProvider,
    RetryInvoicePaymentParams,
    RetryInvoicePaymentResult,
    ScheduleSubscriptionCancelParams,
    ScheduleSubscriptionCancelResult,
} from './payment.provider';
import { StripeClientService } from './stripe-client.service';
import { extractStripeSubscriptionPeriod } from '../stripe-subscription-period';

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
    readonly provider = 'STRIPE' as const;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: AppConfigService,
        private readonly stripeClientService: StripeClientService,
    ) {}

    async createPayment(
        params: CreatePaymentParams,
    ): Promise<CreatePaymentResult> {
        const customerId = await this.ensureCustomer(
            params.userId,
            params.userEmail,
        );

        let session: Stripe.Checkout.Session;
        try {
            session = params.setupOnly
                ? await this.stripeClientService.client.checkout.sessions.create(
                      {
                          mode: 'setup',
                          customer: customerId,
                          client_reference_id: params.invoiceId,
                          success_url: this.buildSuccessUrl(),
                          cancel_url:
                              this.configService.stripeCheckoutCancelUrl!,
                          metadata: {
                              invoiceId: params.invoiceId,
                              subscriptionId: params.subscriptionId,
                              userId: params.userId,
                              planId: params.planId,
                          },
                      },
                  )
                : await this.stripeClientService.client.checkout.sessions.create(
                      {
                          mode: 'subscription',
                          customer: customerId,
                          client_reference_id: params.invoiceId,
                          success_url: this.buildSuccessUrl(),
                          cancel_url:
                              this.configService.stripeCheckoutCancelUrl!,
                          metadata: {
                              invoiceId: params.invoiceId,
                              subscriptionId: params.subscriptionId,
                              userId: params.userId,
                              planId: params.planId,
                          },
                          subscription_data: {
                              metadata: {
                                  invoiceId: params.invoiceId,
                                  subscriptionId: params.subscriptionId,
                                  userId: params.userId,
                                  planId: params.planId,
                              },
                          },
                          line_items: [
                              {
                                  quantity: 1,
                                  price_data: {
                                      currency: params.currency.toLowerCase(),
                                      unit_amount: params.amountCents,
                                      recurring: {
                                          interval: 'month',
                                      },
                                      product_data: {
                                          name: params.productTitle,
                                          description: `Plan: ${params.planName}`,
                                      },
                                  },
                              },
                          ],
                      },
                  );
        } catch (error) {
            this.handleCreatePaymentError(error, customerId, params.currency);
        }

        if (!session.url) {
            throw new AppError({
                code: ErrorCodes.INTERNAL_ERROR,
                message: 'STRIPE_CHECKOUT_URL_MISSING',
                httpStatus: 500,
            });
        }

        return {
            paymentLink: session.url,
            provider: this.provider,
            externalPaymentId: session.id,
        };
    }

    async createCustomerPortalSession(
        params: CreateCustomerPortalSessionParams,
    ): Promise<CreateCustomerPortalSessionResult> {
        const customerId = await this.ensureCustomer(
            params.userId,
            params.userEmail,
        );

        const session =
            await this.stripeClientService.client.billingPortal.sessions.create(
                {
                    customer: customerId,
                    return_url: this.configService.stripePortalReturnUrl!,
                },
            );

        return {
            url: session.url,
        };
    }

    async scheduleSubscriptionCancelAtPeriodEnd(
        params: ScheduleSubscriptionCancelParams,
    ): Promise<ScheduleSubscriptionCancelResult> {
        const subscription =
            await this.stripeClientService.client.subscriptions.update(
                params.externalSubscriptionId,
                {
                    cancel_at_period_end: true,
                },
            );
        const period = extractStripeSubscriptionPeriod(subscription);

        return {
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            currentPeriodEnd: period.currentPeriodEnd,
        };
    }

    async retryInvoicePayment(
        params: RetryInvoicePaymentParams,
    ): Promise<RetryInvoicePaymentResult> {
        const invoice = await this.stripeClientService.client.invoices.pay(
            params.externalInvoiceId,
        );
        return this.toInvoiceResult(invoice);
    }

    async createManagedInvoice(
        params: CreateManagedInvoiceParams,
    ): Promise<RetryInvoicePaymentResult> {
        const customerId = params.externalSubscriptionId
            ? await this.resolveSubscriptionCustomer(
                  params.externalSubscriptionId,
              )
            : await this.ensureCustomer(params.userId, params.userEmail);

        await this.stripeClientService.client.invoiceItems.create({
            customer: customerId,
            ...(params.externalSubscriptionId
                ? {
                      subscription: params.externalSubscriptionId,
                  }
                : {}),
            currency: params.currency.toLowerCase(),
            amount: params.amountCents,
            description: params.description,
            metadata: {
                invoiceId: params.invoiceId,
                periodStart: params.periodStart.toISOString(),
                periodEnd: params.periodEnd.toISOString(),
            },
        });

        let invoice: Stripe.Invoice;
        try {
            invoice = await this.stripeClientService.client.invoices.create({
                customer: customerId,
                ...(params.externalSubscriptionId
                    ? {
                          subscription: params.externalSubscriptionId,
                      }
                    : {}),
                auto_advance: false,
                collection_method: 'charge_automatically',
                metadata: {
                    invoiceId: params.invoiceId,
                    periodStart: params.periodStart.toISOString(),
                    periodEnd: params.periodEnd.toISOString(),
                },
            });
        } catch (error) {
            throw error;
        }

        try {
            if (invoice.status === 'draft') {
                invoice =
                    await this.stripeClientService.client.invoices.finalizeInvoice(
                        invoice.id,
                    );
            }

            if (invoice.status !== 'paid') {
                invoice = await this.stripeClientService.client.invoices.pay(
                    invoice.id,
                );
            }
        } catch (error) {
            invoice = await this.stripeClientService.client.invoices.retrieve(
                invoice.id,
            );
        }

        return this.toInvoiceResult(invoice);
    }

    private async ensureCustomer(
        userId: string,
        userEmail: string,
    ): Promise<string> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                stripeCustomerId: true,
            },
        });

        if (!user) {
            throw new AppError({
                code: ErrorCodes.NOT_FOUND,
                message: 'USER_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (user.stripeCustomerId) {
            return user.stripeCustomerId;
        }

        const customer = await this.stripeClientService.client.customers.create(
            {
                email: user.email || userEmail,
                metadata: {
                    userId: user.id,
                },
            },
        );

        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                stripeCustomerId: customer.id,
            },
        });

        return customer.id;
    }

    private buildSuccessUrl(): string {
        const successUrl = new URL(
            this.configService.stripeCheckoutSuccessUrl!,
        );
        const placeholder = '__CHECKOUT_SESSION_ID__';
        successUrl.searchParams.set('session_id', placeholder);

        return successUrl
            .toString()
            .replace(placeholder, '{CHECKOUT_SESSION_ID}');
    }

    private handleCreatePaymentError(
        error: unknown,
        customerId: string,
        currency: string,
    ): never {
        const stripeError = error as {
            type?: string;
            code?: string;
            message?: string;
        };

        if (
            stripeError?.type === 'StripeInvalidRequestError' &&
            stripeError.message?.includes(
                'You cannot combine currencies on a single customer',
            )
        ) {
            throw new AppError({
                code: ErrorCodes.CONFLICT,
                message:
                    'Stripe customer already has billing activity in another currency. Use a fresh account or a plan with the same currency.',
                httpStatus: 409,
                details: {
                    customerId,
                    requestedCurrency: currency.toUpperCase(),
                },
            });
        }

        throw error;
    }

    private extractExternalSubscriptionId(
        invoice: Stripe.Invoice,
    ): string | undefined {
        const subscription =
            invoice.parent?.subscription_details?.subscription ?? null;
        if (typeof subscription === 'string') {
            return subscription;
        }

        const rootSubscription = (
            invoice as Stripe.Invoice & {
                subscription?: string | Stripe.Subscription | null;
            }
        ).subscription;

        return typeof rootSubscription === 'string'
            ? rootSubscription
            : undefined;
    }

    private async resolveSubscriptionCustomer(
        externalSubscriptionId: string,
    ): Promise<string> {
        const subscription =
            await this.stripeClientService.client.subscriptions.retrieve(
                externalSubscriptionId,
            );
        if (typeof subscription.customer !== 'string') {
            throw new AppError({
                code: ErrorCodes.INTERNAL_ERROR,
                message: 'STRIPE_SUBSCRIPTION_CUSTOMER_MISSING',
                httpStatus: 500,
            });
        }

        return subscription.customer;
    }

    private toInvoiceResult(invoice: Stripe.Invoice): RetryInvoicePaymentResult {
        const externalSubscriptionId =
            this.extractExternalSubscriptionId(invoice);

        return {
            externalInvoiceId: invoice.id,
            externalSubscriptionId,
            amountCents: invoice.total,
            currency: invoice.currency.toUpperCase(),
            periodStart: new Date(invoice.period_start * 1000),
            periodEnd: new Date(invoice.period_end * 1000),
            status: this.mapInvoiceStatus(invoice),
            attemptCount: invoice.attempt_count ?? 0,
            nextPaymentAttemptAt: invoice.next_payment_attempt
                ? new Date(invoice.next_payment_attempt * 1000)
                : null,
        };
    }

    private mapInvoiceStatus(
        invoice: Stripe.Invoice,
    ): RetryInvoicePaymentResult['status'] {
        if (invoice.status === 'paid') {
            return 'PAID';
        }

        if (
            invoice.status === 'void' ||
            invoice.status === 'uncollectible'
        ) {
            return 'VOID';
        }

        return 'PAST_DUE';
    }
}
