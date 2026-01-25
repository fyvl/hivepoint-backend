export interface PaymentProvider {
    createPayment(params: {
        invoiceId: string;
        amountCents: number;
        currency: string;
    }): Promise<{ paymentLink: string }>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
