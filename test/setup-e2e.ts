const defaults: Record<string, string> = {
    JWT_ACCESS_SECRET: 'test-access',
    JWT_REFRESH_SECRET: 'test-refresh',
    JWT_ACCESS_TTL_SECONDS: '900',
    JWT_REFRESH_TTL_SECONDS: '2592000',
    CORS_ORIGINS: 'http://localhost:5173',
    COOKIE_SECURE: 'false',
    ALLOW_PRIVATE_NETWORK_TARGETS: 'true',
    MOCK_PAYMENT_SECRET: 'test-mock',
    API_KEY_SALT: 'test-salt',
    USAGE_INGEST_SECRET: 'test-usage',
};

Object.entries(defaults).forEach(([key, value]) => {
    if (!process.env[key]) {
        process.env[key] = value;
    }
});

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
    throw new Error('DATABASE_URL_TEST is required for e2e tests.');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
