export type ManagedRetryState = {
    managedRetryCount: number;
    managedNextRetryAt: Date | null;
    managedLastRetryAt: Date | null;
    managedRetryExhaustedAt: Date | null;
    managedLastRetryError: string | null;
};

export const clearManagedRetryState = (): ManagedRetryState => ({
    managedRetryCount: 0,
    managedNextRetryAt: null,
    managedLastRetryAt: null,
    managedRetryExhaustedAt: null,
    managedLastRetryError: null,
});

export const createInitialManagedRetryState = (
    referenceTime: Date,
    delayMinutes: number[],
): ManagedRetryState => {
    const nextRetryAt = resolveManagedRetryAt(0, referenceTime, delayMinutes);

    return {
        managedRetryCount: 0,
        managedNextRetryAt: nextRetryAt,
        managedLastRetryAt: null,
        managedRetryExhaustedAt: nextRetryAt ? null : referenceTime,
        managedLastRetryError: null,
    };
};

export const createManagedRetryStateAfterAttempt = (
    currentRetryCount: number,
    attemptedAt: Date,
    delayMinutes: number[],
    errorMessage?: string | null,
): ManagedRetryState => {
    const nextRetryCount = currentRetryCount + 1;
    const nextRetryAt = resolveManagedRetryAt(
        nextRetryCount,
        attemptedAt,
        delayMinutes,
    );

    return {
        managedRetryCount: nextRetryCount,
        managedNextRetryAt: nextRetryAt,
        managedLastRetryAt: attemptedAt,
        managedRetryExhaustedAt: nextRetryAt ? null : attemptedAt,
        managedLastRetryError: errorMessage ?? null,
    };
};

const resolveManagedRetryAt = (
    retryCount: number,
    referenceTime: Date,
    delayMinutes: number[],
): Date | null => {
    const delay = delayMinutes[retryCount];
    if (!delay) {
        return null;
    }

    return new Date(referenceTime.getTime() + delay * 60 * 1000);
};
