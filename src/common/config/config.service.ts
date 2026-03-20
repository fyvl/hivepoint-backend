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
        return this.configService.getOrThrow('BILLING_RECONCILIATION_ENABLED');
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

    get billingManagedRetryEnabled(): boolean {
        return this.configService.getOrThrow('BILLING_MANAGED_RETRY_ENABLED');
    }

    get billingManagedRetryIntervalSeconds(): number {
        return this.configService.getOrThrow(
            'BILLING_MANAGED_RETRY_INTERVAL_SECONDS',
        );
    }

    get billingManagedRetryBatchSize(): number {
        return this.configService.getOrThrow(
            'BILLING_MANAGED_RETRY_BATCH_SIZE',
        );
    }

    get billingManagedRetryDelaysMinutes(): number[] {
        return this.configService.getOrThrow(
            'BILLING_MANAGED_RETRY_DELAYS_MINUTES',
        );
    }

    get apiKeySalt(): string {
        return this.configService.getOrThrow('API_KEY_SALT');
    }

    get usageIngestSecret(): string {
        return this.configService.getOrThrow('USAGE_INGEST_SECRET');
    }

    get usageIngestQueueEnabled(): boolean {
        return this.configService.getOrThrow('USAGE_INGEST_QUEUE_ENABLED');
    }

    get usageIngestQueueIntervalSeconds(): number {
        return this.configService.getOrThrow(
            'USAGE_INGEST_QUEUE_INTERVAL_SECONDS',
        );
    }

    get usageIngestQueueBatchSize(): number {
        return this.configService.getOrThrow('USAGE_INGEST_QUEUE_BATCH_SIZE');
    }

    get alertDeliveryEnabled(): boolean {
        return this.configService.getOrThrow('ALERT_DELIVERY_ENABLED');
    }

    get alertDeliveryWebhookUrl(): string | undefined {
        return this.configService.get('ALERT_DELIVERY_WEBHOOK_URL');
    }

    get alertDeliveryIntervalSeconds(): number {
        return this.configService.getOrThrow('ALERT_DELIVERY_INTERVAL_SECONDS');
    }

    get alertDeliveryCooldownSeconds(): number {
        return this.configService.getOrThrow('ALERT_DELIVERY_COOLDOWN_SECONDS');
    }

    get alertDeliveryTimeoutMs(): number {
        return this.configService.getOrThrow('ALERT_DELIVERY_TIMEOUT_MS');
    }

    get gatewayUpstreamTimeoutMs(): number {
        return this.configService.getOrThrow('GATEWAY_UPSTREAM_TIMEOUT_MS');
    }

    get gatewayBurstLimitEnabled(): boolean {
        return this.configService.getOrThrow('GATEWAY_BURST_LIMIT_ENABLED');
    }

    get gatewayBurstWindowSeconds(): number {
        return this.configService.getOrThrow('GATEWAY_BURST_WINDOW_SECONDS');
    }

    get gatewayBurstMultiplier(): number {
        return this.configService.getOrThrow('GATEWAY_BURST_MULTIPLIER');
    }

    get gatewayBurstMinRequests(): number {
        return this.configService.getOrThrow('GATEWAY_BURST_MIN_REQUESTS');
    }

    get gatewayBurstMaxRequests(): number {
        return this.configService.getOrThrow('GATEWAY_BURST_MAX_REQUESTS');
    }

    get gatewayRequestBodyLimitBytes(): number {
        return this.configService.getOrThrow(
            'GATEWAY_REQUEST_BODY_LIMIT_BYTES',
        );
    }

    get gatewayResponseBodyLimitBytes(): number {
        return this.configService.getOrThrow(
            'GATEWAY_RESPONSE_BODY_LIMIT_BYTES',
        );
    }
}
