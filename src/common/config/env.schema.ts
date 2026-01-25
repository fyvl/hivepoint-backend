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

export const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(1),
    JWT_REFRESH_SECRET: z.string().min(1),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive(),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive(),
    CORS_ORIGINS: z.string().min(1),
    COOKIE_DOMAIN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    COOKIE_SECURE: booleanFromString.default(false),
    REDIS_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    MOCK_PAYMENT_SECRET: z.string().min(1),
    API_KEY_SALT: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => {
    return envSchema.parse(config);
};
