import { Prisma } from '@prisma/client';
import { AppConfigService } from '../../common/config/config.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GatewayBurstLimiterService } from './gateway-burst-limiter.service';

type BucketState = {
    key: string;
    tokens: number;
    lastRefillAt: Date;
};

describe('GatewayBurstLimiterService', () => {
    let service: GatewayBurstLimiterService;
    let gatewayBurstLimitEnabled: boolean;
    let gatewayBurstWindowSeconds: number;
    let gatewayBurstMultiplier: number;
    let gatewayBurstMinRequests: number;
    let gatewayBurstMaxRequests: number;
    let configService: AppConfigService;
    let bucket: BucketState | null;
    let prisma: PrismaService;

    beforeEach(() => {
        gatewayBurstLimitEnabled = true;
        gatewayBurstWindowSeconds = 10;
        gatewayBurstMultiplier = 2;
        gatewayBurstMinRequests = 5;
        gatewayBurstMaxRequests = 120;
        bucket = null;

        configService = {
            get gatewayBurstLimitEnabled() {
                return gatewayBurstLimitEnabled;
            },
            get gatewayBurstWindowSeconds() {
                return gatewayBurstWindowSeconds;
            },
            get gatewayBurstMultiplier() {
                return gatewayBurstMultiplier;
            },
            get gatewayBurstMinRequests() {
                return gatewayBurstMinRequests;
            },
            get gatewayBurstMaxRequests() {
                return gatewayBurstMaxRequests;
            },
        } as AppConfigService;

        prisma = {
            $transaction: jest.fn(async (callback: (tx: Prisma.TransactionClient) => unknown) => {
                const tx = {
                    gatewayBurstBucket: {
                        findUnique: jest.fn(async () => bucket),
                        create: jest.fn(async ({ data }: { data: BucketState }) => {
                            if (bucket) {
                                const error = { code: 'P2002' };
                                throw error;
                            }

                            bucket = {
                                key: data.key,
                                tokens: data.tokens,
                                lastRefillAt: data.lastRefillAt,
                            };

                            return bucket;
                        }),
                        update: jest.fn(async ({ data }: { data: { tokens: number; lastRefillAt: Date } }) => {
                            if (!bucket) {
                                throw new Error('Missing bucket');
                            }

                            bucket = {
                                ...bucket,
                                tokens: data.tokens,
                                lastRefillAt: data.lastRefillAt,
                            };

                            return bucket;
                        }),
                    },
                    $executeRaw: jest.fn(async () => 1),
                } as unknown as Prisma.TransactionClient;

                return callback(tx);
            }),
        } as unknown as PrismaService;

        service = new GatewayBurstLimiterService(prisma, configService);
    });

    it('skips burst limiting when disabled or when the plan has no rpm limit', async () => {
        gatewayBurstLimitEnabled = false;

        const disabled = await service.checkAndConsume({
            key: 'sub-1',
            requestCount: 1,
            rateLimitRpm: 120,
            now: 0,
        });
        const unlimited = await service.checkAndConsume({
            key: 'sub-1',
            requestCount: 1,
            rateLimitRpm: null,
            now: 0,
        });

        expect(disabled).toEqual({
            allowed: true,
            burstLimit: null,
            remainingBurstRequests: null,
            burstWindowSeconds: null,
            retryAfterSeconds: null,
        });
        expect(unlimited).toEqual(disabled);
    });

    it('derives a dynamic burst limit from plan rpm and persists token consumption', async () => {
        const result = await service.checkAndConsume({
            key: 'sub-1',
            requestCount: 1,
            rateLimitRpm: 120,
            now: 0,
        });

        expect(result).toEqual({
            allowed: true,
            burstLimit: 40,
            remainingBurstRequests: 39,
            burstWindowSeconds: 10,
            retryAfterSeconds: null,
        });
        expect(bucket).toEqual({
            key: 'sub-1',
            tokens: 39,
            lastRefillAt: new Date(0),
        });
    });

    it('rejects bursts above the shared capacity and refills over time', async () => {
        const first = await service.checkAndConsume({
            key: 'sub-1',
            requestCount: 40,
            rateLimitRpm: 120,
            now: 0,
        });
        const denied = await service.checkAndConsume({
            key: 'sub-1',
            requestCount: 1,
            rateLimitRpm: 120,
            now: 0,
        });
        const refilled = await service.checkAndConsume({
            key: 'sub-1',
            requestCount: 1,
            rateLimitRpm: 120,
            now: 500,
        });

        expect(first).toMatchObject({
            allowed: true,
            burstLimit: 40,
            remainingBurstRequests: 0,
        });
        expect(denied).toMatchObject({
            allowed: false,
            burstLimit: 40,
            remainingBurstRequests: 0,
            retryAfterSeconds: 1,
        });
        expect(refilled).toMatchObject({
            allowed: true,
            burstLimit: 40,
            remainingBurstRequests: 1,
        });
    });

    it('rejects impossible requests larger than the burst capacity', async () => {
        const result = await service.checkAndConsume({
            key: 'sub-1',
            requestCount: 41,
            rateLimitRpm: 120,
            now: 0,
        });

        expect(result).toEqual({
            allowed: false,
            burstLimit: 40,
            remainingBurstRequests: 40,
            burstWindowSeconds: 10,
            retryAfterSeconds: null,
        });
    });

    it('retries on serializable transaction conflicts', async () => {
        let hasThrownConflict = false;

        (prisma.$transaction as jest.Mock).mockImplementationOnce(async () => {
            hasThrownConflict = true;
            throw { code: 'P2034' };
        });

        const result = await service.checkAndConsume({
            key: 'sub-1',
            requestCount: 1,
            rateLimitRpm: 120,
            now: 0,
        });

        expect(hasThrownConflict).toBe(true);
        expect(result.allowed).toBe(true);
    });
});
