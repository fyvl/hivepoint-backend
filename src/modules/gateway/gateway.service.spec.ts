import { ProductStatus, VersionStatus } from '@prisma/client';
import { AppConfigService } from '../../common/config/config.service';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
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

describe('GatewayService', () => {
    let service: GatewayService;
    let prisma: PrismaMock;
    let usageService: UsageServiceMock;
    let fetchMock: jest.Mock;
    let allowPrivateNetworkTargets: boolean;
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

        allowPrivateNetworkTargets = true;
        configService = {
            get allowPrivateNetworkTargets() {
                return allowPrivateNetworkTargets;
            },
        } as AppConfigService;

        service = new GatewayService(
            prisma as unknown as PrismaService,
            usageService as unknown as UsageService,
            configService,
        );

        fetchMock = jest.fn();
        global.fetch = fetchMock as typeof fetch;
    });

    it('dispatches through the latest published version and consumes usage atomically', async () => {
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

        expect(usageService.authorizeGatewayUsage).toHaveBeenCalledWith(
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
            usage: {
                subscriptionId: 'sub-1',
                requestCount: 1,
                remainingRequests: 10,
                usageRecorded: true,
                periodEnd: new Date('2026-04-01T00:00:00.000Z'),
            },
        });
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
        usageService.authorizeGatewayUsage.mockResolvedValue({
            allowed: true,
            subscriptionId: 'sub-1',
            remainingRequests: 10,
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

        await service.proxy(
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
        usageService.authorizeGatewayUsage.mockResolvedValue({
            allowed: true,
            subscriptionId: 'sub-1',
            remainingRequests: 10,
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
