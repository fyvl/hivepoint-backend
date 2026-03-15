import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.schema';

@Injectable()
export class AppConfigService {
    constructor(private readonly configService: ConfigService<Env, true>) {}

    get port(): number {
        return this.configService.getOrThrow('PORT');
    }

    get databaseUrl(): string {
        return this.configService.getOrThrow('DATABASE_URL');
    }

    get jwtAccessSecret(): string {
        return this.configService.getOrThrow('JWT_ACCESS_SECRET');
    }

    get jwtRefreshSecret(): string {
        return this.configService.getOrThrow('JWT_REFRESH_SECRET');
    }

    get jwtAccessTtlSeconds(): number {
        return this.configService.getOrThrow('JWT_ACCESS_TTL_SECONDS');
    }

    get jwtRefreshTtlSeconds(): number {
        return this.configService.getOrThrow('JWT_REFRESH_TTL_SECONDS');
    }

    get corsOrigins(): string[] {
        const raw = this.configService.getOrThrow<string>('CORS_ORIGINS');
        return raw
            .split(',')
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0);
    }

    get cookieDomain(): string | undefined {
        return this.configService.get('COOKIE_DOMAIN');
    }

    get cookieSecure(): boolean {
        return this.configService.getOrThrow('COOKIE_SECURE');
    }

    get allowPrivateNetworkTargets(): boolean {
        return this.configService.getOrThrow('ALLOW_PRIVATE_NETWORK_TARGETS');
    }

    get redisUrl(): string | undefined {
        return this.configService.get('REDIS_URL');
    }

    get paymentProvider(): Env['PAYMENT_PROVIDER'] {
        return this.configService.getOrThrow('PAYMENT_PROVIDER');
    }

    get stripeSecretKey(): string | undefined {
        return this.configService.get('STRIPE_SECRET_KEY');
    }

    get stripeWebhookSecret(): string | undefined {
        return this.configService.get('STRIPE_WEBHOOK_SECRET');
    }

    get stripeCheckoutSuccessUrl(): string | undefined {
        return this.configService.get('STRIPE_CHECKOUT_SUCCESS_URL');
    }

    get stripeCheckoutCancelUrl(): string | undefined {
        return this.configService.get('STRIPE_CHECKOUT_CANCEL_URL');
    }

    get stripePortalReturnUrl(): string | undefined {
        return this.configService.get('STRIPE_PORTAL_RETURN_URL');
    }

    get billingGracePeriodDays(): number {
        return this.configService.getOrThrow('BILLING_GRACE_PERIOD_DAYS');
    }

    get billingReconciliationEnabled(): boolean {
        return this.configService.getOrThrow(
            'BILLING_RECONCILIATION_ENABLED',
        );
    }

    get billingReconciliationIntervalSeconds(): number {
        return this.configService.getOrThrow(
            'BILLING_RECONCILIATION_INTERVAL_SECONDS',
        );
    }

    get billingReconciliationBatchSize(): number {
        return this.configService.getOrThrow(
            'BILLING_RECONCILIATION_BATCH_SIZE',
        );
    }
}
