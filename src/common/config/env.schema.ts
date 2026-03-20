import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') {
            return true;
        }
        if (normalized === 'false' || normalized === '0') {
            return false;
        }
    }

    return value;
}, z.boolean());

const emptyToUndefined = (value: unknown): unknown => {
    if (typeof value === 'string' && value.trim() === '') {
        return undefined;
    }

    return value;
};

const intArrayFromCsv = z.preprocess((value) => {
    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value !== 'string') {
        return value;
    }

    return value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .map((item) => Number.parseInt(item, 10));
}, z.array(z.number().int().positive()).default([60, 360, 1440]));

export const envSchema = z
    .object({
        PORT: z.coerce.number().int().positive().default(3000),
        DATABASE_URL: z.string().min(1),
        JWT_ACCESS_SECRET: z.string().min(1),
        JWT_REFRESH_SECRET: z.string().min(1),
        JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive(),
        JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive(),
        CORS_ORIGINS: z.string().min(1),
        COOKIE_DOMAIN: z.preprocess(
            emptyToUndefined,
            z.string().min(1).optional(),
        ),
        COOKIE_SECURE: booleanFromString.default(false),
        ALLOW_PRIVATE_NETWORK_TARGETS: booleanFromString.default(false),
        REDIS_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
        PAYMENT_PROVIDER: z.enum(['MOCK', 'STRIPE']).default('MOCK'),
        MOCK_PAYMENT_SECRET: z.string().min(1),
        STRIPE_SECRET_KEY: z.preprocess(
            emptyToUndefined,
            z.string().min(1).optional(),
        ),
        STRIPE_WEBHOOK_SECRET: z.preprocess(
            emptyToUndefined,
            z.string().min(1).optional(),
        ),
        STRIPE_CHECKOUT_SUCCESS_URL: z.preprocess(
            emptyToUndefined,
            z.string().url().optional(),
        ),
        STRIPE_CHECKOUT_CANCEL_URL: z.preprocess(
            emptyToUndefined,
            z.string().url().optional(),
        ),
        STRIPE_PORTAL_RETURN_URL: z.preprocess(
            emptyToUndefined,
            z.string().url().optional(),
        ),
        BILLING_GRACE_PERIOD_DAYS: z.coerce.number().int().min(0).default(3),
        BILLING_RECONCILIATION_ENABLED: booleanFromString.default(true),
        BILLING_RECONCILIATION_INTERVAL_SECONDS: z.coerce
            .number()
            .int()
            .positive()
            .default(300),
        BILLING_RECONCILIATION_BATCH_SIZE: z.coerce
            .number()
            .int()
            .positive()
            .default(25),
        BILLING_MANAGED_RETRY_ENABLED: booleanFromString.default(true),
        BILLING_MANAGED_RETRY_INTERVAL_SECONDS: z.coerce
            .number()
            .int()
            .positive()
            .default(60),
        BILLING_MANAGED_RETRY_BATCH_SIZE: z.coerce
            .number()
            .int()
            .positive()
            .default(25),
        BILLING_MANAGED_RETRY_DELAYS_MINUTES: intArrayFromCsv,
        API_KEY_SALT: z.string().min(1),
        USAGE_INGEST_SECRET: z.string().min(1),
        USAGE_INGEST_QUEUE_ENABLED: booleanFromString.default(true),
        USAGE_INGEST_QUEUE_INTERVAL_SECONDS: z.coerce
            .number()
            .int()
            .positive()
            .default(10),
        USAGE_INGEST_QUEUE_BATCH_SIZE: z.coerce
            .number()
            .int()
            .positive()
            .default(100),
        ALERT_DELIVERY_ENABLED: booleanFromString.default(false),
        ALERT_DELIVERY_WEBHOOK_URL: z.preprocess(
            emptyToUndefined,
            z.string().url().optional(),
        ),
        ALERT_DELIVERY_INTERVAL_SECONDS: z.coerce
            .number()
            .int()
            .positive()
            .default(60),
        ALERT_DELIVERY_COOLDOWN_SECONDS: z.coerce
            .number()
            .int()
            .positive()
            .default(900),
        ALERT_DELIVERY_TIMEOUT_MS: z.coerce
            .number()
            .int()
            .positive()
            .default(10_000),
        GATEWAY_UPSTREAM_TIMEOUT_MS: z.coerce
            .number()
            .int()
            .positive()
            .default(15_000),
        GATEWAY_BURST_LIMIT_ENABLED: booleanFromString.default(true),
        GATEWAY_BURST_WINDOW_SECONDS: z.coerce
            .number()
            .int()
            .positive()
            .default(10),
        GATEWAY_BURST_MULTIPLIER: z.coerce.number().positive().default(2),
        GATEWAY_BURST_MIN_REQUESTS: z.coerce
            .number()
            .int()
            .positive()
            .default(5),
        GATEWAY_BURST_MAX_REQUESTS: z.coerce
            .number()
            .int()
            .positive()
            .default(120),
        GATEWAY_REQUEST_BODY_LIMIT_BYTES: z.coerce
            .number()
            .int()
            .positive()
            .default(256 * 1024),
        GATEWAY_RESPONSE_BODY_LIMIT_BYTES: z.coerce
            .number()
            .int()
            .positive()
            .default(1024 * 1024),
    })
    .superRefine((env, context) => {
        if (env.ALERT_DELIVERY_ENABLED && !env.ALERT_DELIVERY_WEBHOOK_URL) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    'ALERT_DELIVERY_WEBHOOK_URL is required when ALERT_DELIVERY_ENABLED=true',
                path: ['ALERT_DELIVERY_WEBHOOK_URL'],
            });
        }

        if (env.PAYMENT_PROVIDER === 'STRIPE') {
            if (!env.STRIPE_SECRET_KEY) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                        'STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=STRIPE',
                    path: ['STRIPE_SECRET_KEY'],
                });
            }

            if (!env.STRIPE_WEBHOOK_SECRET) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                        'STRIPE_WEBHOOK_SECRET is required when PAYMENT_PROVIDER=STRIPE',
                    path: ['STRIPE_WEBHOOK_SECRET'],
                });
            }

            if (!env.STRIPE_CHECKOUT_SUCCESS_URL) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                        'STRIPE_CHECKOUT_SUCCESS_URL is required when PAYMENT_PROVIDER=STRIPE',
                    path: ['STRIPE_CHECKOUT_SUCCESS_URL'],
                });
            }

            if (!env.STRIPE_CHECKOUT_CANCEL_URL) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                        'STRIPE_CHECKOUT_CANCEL_URL is required when PAYMENT_PROVIDER=STRIPE',
                    path: ['STRIPE_CHECKOUT_CANCEL_URL'],
                });
            }

            if (!env.STRIPE_PORTAL_RETURN_URL) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                        'STRIPE_PORTAL_RETURN_URL is required when PAYMENT_PROVIDER=STRIPE',
                    path: ['STRIPE_PORTAL_RETURN_URL'],
                });
            }
        }
    });

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => {
    return envSchema.parse(config);
};
