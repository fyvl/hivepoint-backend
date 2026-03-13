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

export interface PaymentProvider {
    readonly provider: BillingProviderName;

    createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;

    createCustomerPortalSession(
        params: CreateCustomerPortalSessionParams,
    ): Promise<CreateCustomerPortalSessionResult>;

    scheduleSubscriptionCancelAtPeriodEnd(
        params: ScheduleSubscriptionCancelParams,
    ): Promise<ScheduleSubscriptionCancelResult>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
