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
        API_KEY_SALT: z.string().min(1),
        USAGE_INGEST_SECRET: z.string().min(1),
    })
    .superRefine((env, context) => {
        if (env.PAYMENT_PROVIDER !== 'STRIPE') {
            return;
        }

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
    });

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => {
    return envSchema.parse(config);
};
