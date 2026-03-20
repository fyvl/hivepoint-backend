export type BillingProviderName = 'MOCK' | 'STRIPE';

export type CreatePaymentParams = {
    invoiceId: string;
    subscriptionId: string;
    userId: string;
    userEmail: string;
    planId: string;
    planName: string;
    productTitle: string;
    amountCents: number;
    currency: string;
};

export type CreatePaymentResult = {
    paymentLink: string;
    provider: BillingProviderName;
    externalPaymentId?: string;
};

export type CreateCustomerPortalSessionParams = {
    userId: string;
    userEmail: string;
};

export type CreateCustomerPortalSessionResult = {
    url: string;
};

export type ScheduleSubscriptionCancelParams = {
    externalSubscriptionId: string;
};

export type ScheduleSubscriptionCancelResult = {
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd?: Date | null;
};

export type RetryInvoicePaymentParams = {
    externalInvoiceId: string;
};

export type RetryInvoicePaymentResult = {
    externalInvoiceId: string;
    externalSubscriptionId?: string;
    amountCents: number;
    currency: string;
    periodStart: Date;
    periodEnd: Date;
    status: 'DRAFT' | 'PAID' | 'PAST_DUE' | 'VOID';
    attemptCount?: number | null;
    nextPaymentAttemptAt?: Date | null;
};

export interface PaymentProvider {
    readonly provider: BillingProviderName;

    createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;

    createCustomerPortalSession(
        params: CreateCustomerPortalSessionParams,
    ): Promise<CreateCustomerPortalSessionResult>;

    scheduleSubscriptionCancelAtPeriodEnd(
        params: ScheduleSubscriptionCancelParams,
    ): Promise<ScheduleSubscriptionCancelResult>;

    retryInvoicePayment(
        params: RetryInvoicePaymentParams,
    ): Promise<RetryInvoicePaymentResult>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
