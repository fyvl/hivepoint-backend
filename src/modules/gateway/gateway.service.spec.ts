import { ProductStatus, VersionStatus } from '@prisma/client';
import { AppConfigService } from '../../common/config/config.service';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
import {
    GatewayBurstLimiterService,
    type GatewayBurstLimitDecision,
} from './gateway-burst-limiter.service';
import { GatewayService } from './gateway.service';

type PrismaMock = {
    apiProduct: {
        findUnique: jest.Mock;
    };
    apiVersion: {
        findFirst: jest.Mock;
    };
};

type UsageServiceMock = {
    authorizeGatewayUsage: jest.Mock;
};

type GatewayBurstLimiterMock = {
    checkAndConsume: jest.Mock;
};

const defaultBurstDecision = (): GatewayBurstLimitDecision => ({
    allowed: true,
    burstLimit: 40,
    remainingBurstRequests: 39,
    burstWindowSeconds: 10,
    retryAfterSeconds: null,
});

describe('GatewayService', () => {
    let service: GatewayService;
    let prisma: PrismaMock;
    let usageService: UsageServiceMock;
    let gatewayBurstLimiterService: GatewayBurstLimiterMock;
    let fetchMock: jest.Mock;
    let allowPrivateNetworkTargets: boolean;
    let gatewayUpstreamTimeoutMs: number;
    let gatewayRequestBodyLimitBytes: number;
    let gatewayResponseBodyLimitBytes: number;
    let configService: AppConfigService;

    beforeEach(() => {
        prisma = {
            apiProduct: {
                findUnique: jest.fn(),
            },
            apiVersion: {
                findFirst: jest.fn(),
            },
        };

        usageService = {
            authorizeGatewayUsage: jest.fn(),
        };
        gatewayBurstLimiterService = {
            checkAndConsume: jest.fn().mockReturnValue(defaultBurstDecision()),
        };

        allowPrivateNetworkTargets = true;
        gatewayUpstreamTimeoutMs = 15_000;
        gatewayRequestBodyLimitBytes = 256 * 1024;
        gatewayResponseBodyLimitBytes = 1024 * 1024;
        configService = {
            get allowPrivateNetworkTargets() {
                return allowPrivateNetworkTargets;
            },
            get gatewayUpstreamTimeoutMs() {
                return gatewayUpstreamTimeoutMs;
            },
            get gatewayRequestBodyLimitBytes() {
                return gatewayRequestBodyLimitBytes;
            },
            get gatewayResponseBodyLimitBytes() {
                return gatewayResponseBodyLimitBytes;
            },
        } as AppConfigService;

        service = new GatewayService(
            prisma as unknown as PrismaService,
            usageService as unknown as UsageService,
            configService,
            gatewayBurstLimiterService as unknown as GatewayBurstLimiterService,
        );

        fetchMock = jest.fn();
        global.fetch = fetchMock as typeof fetch;
    });

    it('dispatches through the latest published version after preliminary auth and burst checks', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Demo API',
            status: ProductStatus.PUBLISHED,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            version: 'v1',
            openApiUrl: 'https://seller.example.com/openapi.json',
            openApiSnapshot: JSON.stringify({
                openapi: '3.0.0',
                servers: [{ url: '/v1' }],
            }),
            status: VersionStatus.PUBLISHED,
        });
        usageService.authorizeGatewayUsage
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: 120,
                remainingRateLimitRequests: 119,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: false,
            })
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: 120,
                remainingRateLimitRequests: 119,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: true,
            });
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ pong: true }), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                    'x-request-id': 'req-1',
                },
            }),
        );

        const result = await service.dispatch(
            {
                productId: 'prod-1',
                path: '/health',
                method: 'GET',
                headers: {},
                query: { verbose: true },
                requestCount: 1,
            },
            'hp_valid',
        );

        expect(usageService.authorizeGatewayUsage).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                apiKey: 'hp_valid',
                endpoint: '/health',
                requestCount: 1,
                consume: false,
            }),
        );
        expect(gatewayBurstLimiterService.checkAndConsume).toHaveBeenCalledWith({
            key: 'sub-1',
            requestCount: 1,
            rateLimitRpm: 120,
        });
        expect(usageService.authorizeGatewayUsage).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                apiKey: 'hp_valid',
                endpoint: '/health',
                requestCount: 1,
                consume: true,
            }),
        );
        expect(fetchMock).toHaveBeenCalledWith(
            'https://seller.example.com/v1/health?verbose=true',
            expect.objectContaining({
                method: 'GET',
            }),
        );
        expect(result).toEqual({
            ok: true,
            status: 200,
            method: 'GET',
            upstreamUrl: 'https://seller.example.com/v1/health?verbose=true',
            contentType: 'application/json',
            headers: {
                'content-type': 'application/json',
                'x-request-id': 'req-1',
            },
            body: {
                pong: true,
            },
            bodyEncoding: 'json',
            usage: {
                subscriptionId: 'sub-1',
                requestCount: 1,
                remainingRequests: 10,
                rateLimitRpm: 120,
                remainingRateLimitRequests: 119,
                burstLimit: 40,
                remainingBurstRequests: 39,
                burstWindowSeconds: 10,
                usageRecorded: true,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
            },
        });
    });

    it('rejects dispatch when the burst limiter denies traffic before usage is consumed', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Demo API',
            status: ProductStatus.PUBLISHED,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            version: 'v1',
            openApiUrl: 'https://seller.example.com/openapi.json',
            openApiSnapshot: JSON.stringify({
                openapi: '3.0.0',
                servers: [{ url: '/v1' }],
            }),
            status: VersionStatus.PUBLISHED,
        });
        usageService.authorizeGatewayUsage.mockResolvedValue({
            allowed: true,
            subscriptionId: 'sub-1',
            remainingRequests: 10,
            rateLimitRpm: 120,
            remainingRateLimitRequests: 119,
            periodEnd: new Date('2026-04-01T00:00:00.000Z'),
            usageRecorded: false,
        });
        gatewayBurstLimiterService.checkAndConsume.mockReturnValue({
            allowed: false,
            burstLimit: 40,
            remainingBurstRequests: 0,
            burstWindowSeconds: 10,
            retryAfterSeconds: 2,
        });

        await expect(
            service.dispatch(
                {
                    productId: 'prod-1',
                    path: '/health',
                    method: 'GET',
                    headers: {},
                    query: {},
                    requestCount: 1,
                },
                'hp_valid',
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.RATE_LIMIT_EXCEEDED,
            details: expect.objectContaining({
                policy: 'gateway-burst',
                burstLimit: 40,
                retryAfterSeconds: 2,
            }),
        });

        expect(usageService.authorizeGatewayUsage).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('adds application/json content-type when forwarding an object body', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Demo API',
            status: ProductStatus.PUBLISHED,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            version: 'v1',
            openApiUrl: 'https://seller.example.com/openapi.json',
            openApiSnapshot: JSON.stringify({
                openapi: '3.0.0',
                servers: [{ url: '/v1' }],
            }),
            status: VersionStatus.PUBLISHED,
        });
        gatewayBurstLimiterService.checkAndConsume.mockReturnValue({
            allowed: true,
            burstLimit: null,
            remainingBurstRequests: null,
            burstWindowSeconds: null,
            retryAfterSeconds: null,
        });
        usageService.authorizeGatewayUsage
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: false,
            })
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: true,
            });
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ ok: true }), {
                status: 201,
                headers: {
                    'content-type': 'application/json',
                },
            }),
        );

        const result = await service.proxy(
            {
                productId: 'prod-1',
                path: '/echo',
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    expect: '100-continue',
                },
                query: {},
                body: {
                    hello: 'world',
                },
                requestCount: 1,
            },
            'hp_valid',
        );

        const [, requestInit] = fetchMock.mock.calls[0] as [
            string,
            RequestInit,
        ];
        expect(requestInit.body).toBe('{"hello":"world"}');
        expect((requestInit.headers as Headers).get('content-type')).toBe(
            'application/json',
        );
        expect((requestInit.headers as Headers).get('expect')).toBeNull();
        expect(result.rawBody).toEqual(Buffer.from('{"ok":true}'));
        expect(result.bodyEncoding).toBe('json');
        expect(result.usage.burstLimit).toBeNull();
    });

    it('returns base64 body encoding for binary dispatch responses', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Demo API',
            status: ProductStatus.PUBLISHED,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            version: 'v1',
            openApiUrl: 'https://seller.example.com/openapi.json',
            openApiSnapshot: JSON.stringify({
                openapi: '3.0.0',
                servers: [{ url: '/v1' }],
            }),
            status: VersionStatus.PUBLISHED,
        });
        gatewayBurstLimiterService.checkAndConsume.mockReturnValue({
            allowed: true,
            burstLimit: null,
            remainingBurstRequests: null,
            burstWindowSeconds: null,
            retryAfterSeconds: null,
        });
        usageService.authorizeGatewayUsage
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: false,
            })
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: true,
            });
        fetchMock.mockResolvedValue(
            new Response(Buffer.from([1, 2, 3]), {
                status: 200,
                headers: {
                    'content-type': 'application/octet-stream',
                },
            }),
        );

        const result = await service.dispatch(
            {
                productId: 'prod-1',
                path: '/blob',
                method: 'GET',
                headers: {},
                query: {},
                requestCount: 1,
            },
            'hp_valid',
        );

        expect(result.body).toBe('AQID');
        expect(result.bodyEncoding).toBe('base64');
    });

    it('passes stream-oriented proxy responses through as a response stream', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Demo API',
            status: ProductStatus.PUBLISHED,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            version: 'v1',
            openApiUrl: 'https://seller.example.com/openapi.json',
            openApiSnapshot: JSON.stringify({
                openapi: '3.0.0',
                servers: [{ url: '/v1' }],
            }),
            status: VersionStatus.PUBLISHED,
        });
        gatewayBurstLimiterService.checkAndConsume.mockReturnValue({
            allowed: true,
            burstLimit: null,
            remainingBurstRequests: null,
            burstWindowSeconds: null,
            retryAfterSeconds: null,
        });
        usageService.authorizeGatewayUsage
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: false,
            })
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: true,
            });
        fetchMock.mockResolvedValue(
            new Response('data: hello\n\n', {
                status: 200,
                headers: {
                    'content-type': 'text/event-stream',
                },
            }),
        );

        const result = await service.proxy(
            {
                productId: 'prod-1',
                path: '/stream',
                method: 'GET',
                headers: {},
                query: {},
                requestCount: 1,
            },
            'hp_valid',
        );

        expect(result.rawBody).toBeNull();
        expect(result.responseStream).not.toBeNull();
        expect(result.body).toBeNull();
        expect(result.bodyEncoding).toBeNull();
    });
    it('rejects proxy requests with bodies larger than the configured limit', async () => {
        gatewayRequestBodyLimitBytes = 4;
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Demo API',
            status: ProductStatus.PUBLISHED,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            version: 'v1',
            openApiUrl: 'https://seller.example.com/openapi.json',
            openApiSnapshot: JSON.stringify({
                openapi: '3.0.0',
                servers: [{ url: '/v1' }],
            }),
            status: VersionStatus.PUBLISHED,
        });
        gatewayBurstLimiterService.checkAndConsume.mockReturnValue({
            allowed: true,
            burstLimit: null,
            remainingBurstRequests: null,
            burstWindowSeconds: null,
            retryAfterSeconds: null,
        });
        usageService.authorizeGatewayUsage
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: false,
            })
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: true,
            });

        await expect(
            service.proxy(
                {
                    productId: 'prod-1',
                    path: '/blob',
                    method: 'POST',
                    headers: {
                        'content-type': 'application/octet-stream',
                    },
                    query: {},
                    body: Buffer.from([1, 2, 3, 4, 5]),
                    requestCount: 1,
                },
                'hp_valid',
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.GATEWAY_REQUEST_BODY_TOO_LARGE,
        });

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects upstream responses larger than the configured limit', async () => {
        gatewayResponseBodyLimitBytes = 2;
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Demo API',
            status: ProductStatus.PUBLISHED,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            version: 'v1',
            openApiUrl: 'https://seller.example.com/openapi.json',
            openApiSnapshot: JSON.stringify({
                openapi: '3.0.0',
                servers: [{ url: '/v1' }],
            }),
            status: VersionStatus.PUBLISHED,
        });
        gatewayBurstLimiterService.checkAndConsume.mockReturnValue({
            allowed: true,
            burstLimit: null,
            remainingBurstRequests: null,
            burstWindowSeconds: null,
            retryAfterSeconds: null,
        });
        usageService.authorizeGatewayUsage
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: false,
            })
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: true,
            });
        fetchMock.mockResolvedValue(
            new Response(Buffer.from([1, 2, 3]), {
                status: 200,
                headers: {
                    'content-type': 'application/octet-stream',
                },
            }),
        );

        await expect(
            service.dispatch(
                {
                    productId: 'prod-1',
                    path: '/blob',
                    method: 'GET',
                    headers: {},
                    query: {},
                    requestCount: 1,
                },
                'hp_valid',
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.GATEWAY_RESPONSE_BODY_TOO_LARGE,
        });
    });

    it('rejects dispatch when usage authorization denies access', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Demo API',
            status: ProductStatus.PUBLISHED,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            version: 'v1',
            openApiUrl: 'https://seller.example.com/openapi.json',
            openApiSnapshot: JSON.stringify({
                openapi: '3.0.0',
                servers: [{ url: 'https://seller.example.com/v1' }],
            }),
            status: VersionStatus.PUBLISHED,
        });
        usageService.authorizeGatewayUsage.mockResolvedValue({
            allowed: false,
            reason: 'QUOTA_EXCEEDED',
        });

        await expect(
            service.dispatch(
                {
                    productId: 'prod-1',
                    path: '/health',
                    method: 'GET',
                    headers: {},
                    query: {},
                    requestCount: 1,
                },
                'hp_valid',
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.QUOTA_EXCEEDED,
        });

        expect(gatewayBurstLimiterService.checkAndConsume).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects dispatch when gateway rate limit is exceeded', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Demo API',
            status: ProductStatus.PUBLISHED,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            version: 'v1',
            openApiUrl: 'https://seller.example.com/openapi.json',
            openApiSnapshot: JSON.stringify({
                openapi: '3.0.0',
                servers: [{ url: 'https://seller.example.com/v1' }],
            }),
            status: VersionStatus.PUBLISHED,
        });
        usageService.authorizeGatewayUsage.mockResolvedValue({
            allowed: false,
            reason: 'RATE_LIMIT_EXCEEDED',
        });

        await expect(
            service.dispatch(
                {
                    productId: 'prod-1',
                    path: '/health',
                    method: 'GET',
                    headers: {},
                    query: {},
                    requestCount: 1,
                },
                'hp_valid',
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        });

        expect(gatewayBurstLimiterService.checkAndConsume).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects unsafe upstream targets from the schema server list', async () => {
        allowPrivateNetworkTargets = false;
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            title: 'Demo API',
            status: ProductStatus.PUBLISHED,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({
            id: 'ver-1',
            version: 'v1',
            openApiUrl: 'https://seller.example.com/openapi.json',
            openApiSnapshot: JSON.stringify({
                openapi: '3.0.0',
                servers: [{ url: 'http://127.0.0.1:9000/internal' }],
            }),
            status: VersionStatus.PUBLISHED,
        });
        gatewayBurstLimiterService.checkAndConsume.mockReturnValue({
            allowed: true,
            burstLimit: null,
            remainingBurstRequests: null,
            burstWindowSeconds: null,
            retryAfterSeconds: null,
        });
        usageService.authorizeGatewayUsage
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: false,
            })
            .mockResolvedValueOnce({
                allowed: true,
                subscriptionId: 'sub-1',
                remainingRequests: 10,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
                usageRecorded: true,
            });

        await expect(
            service.dispatch(
                {
                    productId: 'prod-1',
                    path: '/health',
                    method: 'GET',
                    headers: {},
                    query: {},
                    requestCount: 1,
                },
                'hp_valid',
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.UNSAFE_EXTERNAL_URL,
            message: 'UPSTREAM_URL_NOT_ALLOWED',
        });

        expect(fetchMock).not.toHaveBeenCalled();
    });
});

