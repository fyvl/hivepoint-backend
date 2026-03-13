import Stripe from 'stripe';

type StripeSubscriptionPeriod = {
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
};

export const extractStripeSubscriptionPeriod = (
    subscription: Stripe.Subscription,
): StripeSubscriptionPeriod => {
    const itemPeriods = subscription.items.data
        .map((item) => ({
            start: item.current_period_start,
            end: item.current_period_end,
        }))
        .filter(
            (period): period is { start: number; end: number } =>
                typeof period.start === 'number' &&
                typeof period.end === 'number',
        );

    if (itemPeriods.length === 0) {
        return {
            currentPeriodStart: null,
            currentPeriodEnd: null,
        };
    }

    const currentPeriodStart = new Date(
        Math.min(...itemPeriods.map((period) => period.start)) * 1000,
    );
    const currentPeriodEnd = new Date(
        Math.max(...itemPeriods.map((period) => period.end)) * 1000,
    );

    return {
        currentPeriodStart,
        currentPeriodEnd,
    };
};
