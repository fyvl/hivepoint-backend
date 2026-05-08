import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

describe('GatewayController', () => {
    let app: INestApplication;
    const gatewayService = {
        dispatch: jest.fn(),
        proxy: jest.fn(),
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [GatewayController],
            providers: [
                {
                    provide: GatewayService,
                    useValue: gatewayService,
                },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalFilters(new HttpExceptionFilter());
        await app.init();
    });

    beforeEach(() => {
        jest.resetAllMocks();
    });

    afterAll(async () => {
        await app.close();
    });

    it('returns HTTP 200 for dispatch responses', async () => {
        gatewayService.dispatch.mockResolvedValue({
            ok: true,
            status: 200,
            method: 'GET',
            upstreamUrl: 'https://seller.example.com/v1/health',
            contentType: 'application/json',
            headers: {
                'content-type': 'application/json',
            },
            body: {
                ok: true,
            },
            bodyEncoding: 'json',
            usage: {
                subscriptionId: 'sub-1',
                requestCount: 1,
                remainingRequests: 99,
                rateLimitRpm: 120,
                remainingRateLimitRequests: 119,
                burstLimit: 40,
                remainingBurstRequests: 39,
                burstWindowSeconds: 10,
                usageRecorded: true,
                periodEnd: new Date('2026-04-12T00:00:00.000Z'),
            },
        });

        const response = await request(app.getHttpServer())
            .post('/gateway/dispatch')
            .set('x-api-key', 'hp_valid')
            .send({
                productId: 'prod-1',
                path: '/health',
                method: 'GET',
                requestCount: 1,
            })
            .expect(200);

        expect(response.body).toEqual(
            expect.objectContaining({
                ok: true,
                status: 200,
                bodyEncoding: 'json',
            }),
        );
        expect(response.body.usage).toEqual(
            expect.objectContaining({
                burstLimit: 40,
                remainingBurstRequests: 39,
                burstWindowSeconds: 10,
            }),
        );
    });

    it('matches the proxy route and forwards upstream status, headers, and body directly', async () => {
        gatewayService.proxy.mockResolvedValue({
            ok: true,
            status: 202,
            method: 'POST',
            upstreamUrl: 'https://seller.example.com/v1/echo?foo=bar',
            contentType: 'application/json',
            headers: {
                'content-type': 'application/json; charset=utf-8',
                'x-upstream-request-id': 'req-1',
            },
            body: {
                echoed: true,
            },
            bodyEncoding: 'json',
            rawBody: Buffer.from('{"echoed":true}'),
            responseStream: null,
            usage: {
                subscriptionId: 'sub-1',
                requestCount: 1,
                remainingRequests: 41,
                rateLimitRpm: 120,
                remainingRateLimitRequests: 40,
                burstLimit: 40,
                remainingBurstRequests: 39,
                burstWindowSeconds: 10,
                usageRecorded: true,
                periodEnd: new Date('2026-04-12T00:00:00.000Z'),
            },
        });

        const response = await request(app.getHttpServer())
            .post('/gateway/products/prod-1/v1/echo?foo=bar')
            .set('x-api-key', 'hp_valid')
            .set('x-client-id', 'playground')
            .send({ hello: 'world' })
            .expect(202);

        expect(response.body).toEqual({ echoed: true });
        expect(response.headers['x-upstream-request-id']).toBe('req-1');
        expect(response.headers['x-hivepoint-subscription-id']).toBe('sub-1');
        expect(response.headers['x-hivepoint-remaining-requests']).toBe('41');
        expect(response.headers['x-hivepoint-rate-limit-rpm']).toBe('120');
        expect(response.headers['x-hivepoint-rate-limit-remaining']).toBe('40');
        expect(response.headers['x-hivepoint-burst-limit']).toBe('40');
        expect(response.headers['x-hivepoint-burst-remaining']).toBe('39');
        expect(response.headers['x-hivepoint-burst-window-seconds']).toBe('10');
        expect(gatewayService.proxy).toHaveBeenCalledWith(
            expect.objectContaining({
                productId: 'prod-1',
                path: '/v1/echo',
                method: 'POST',
                query: {
                    foo: 'bar',
                },
                body: {
                    hello: 'world',
                },
                requestCount: 1,
            }),
            'hp_valid',
        );
    });

    it('passes buffered binary proxy responses through unchanged', async () => {
        gatewayService.proxy.mockResolvedValue({
            ok: true,
            status: 200,
            method: 'GET',
            upstreamUrl: 'https://seller.example.com/v1/blob',
            contentType: 'application/octet-stream',
            headers: {
                'content-type': 'application/octet-stream',
            },
            body: 'AQID',
            bodyEncoding: 'base64',
            rawBody: Buffer.from([1, 2, 3]),
            responseStream: null,
            usage: {
                subscriptionId: 'sub-1',
                requestCount: 1,
                remainingRequests: 41,
                rateLimitRpm: null,
                remainingRateLimitRequests: null,
                burstLimit: null,
                remainingBurstRequests: null,
                burstWindowSeconds: null,
                usageRecorded: true,
                periodEnd: null,
            },
        });

        const response = await request(app.getHttpServer())
            .get('/gateway/products/prod-1/v1/blob')
            .set('x-api-key', 'hp_valid')
            .buffer(true)
            .parse((res, callback) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                res.on('end', () => callback(null, Buffer.concat(chunks)));
            })
            .expect(200);

        expect(response.headers['content-type']).toContain(
            'application/octet-stream',
        );
        expect(Buffer.isBuffer(response.body)).toBe(true);
        expect([...response.body]).toEqual([1, 2, 3]);
    });

    it('streams proxy responses when the gateway returns a response stream', async () => {
        gatewayService.proxy.mockResolvedValue({
            ok: true,
            status: 200,
            method: 'GET',
            upstreamUrl: 'https://seller.example.com/v1/events',
            contentType: 'text/event-stream',
            headers: {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache',
            },
            body: null,
            bodyEncoding: null,
            rawBody: null,
            responseStream: new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(Buffer.from('data: hello\n\n', 'utf8'));
                    controller.close();
                },
            }),
            usage: {
                subscriptionId: 'sub-1',
                requestCount: 1,
                remainingRequests: 41,
                rateLimitRpm: 120,
                remainingRateLimitRequests: 40,
                burstLimit: 40,
                remainingBurstRequests: 39,
                burstWindowSeconds: 10,
                usageRecorded: true,
                periodEnd: new Date('2026-04-12T00:00:00.000Z'),
            },
        });

        const response = await request(app.getHttpServer())
            .get('/gateway/products/prod-1/v1/events')
            .set('x-api-key', 'hp_valid')
            .buffer(true)
            .parse((res, callback) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                res.on('end', () =>
                    callback(null, Buffer.concat(chunks).toString('utf8')),
                );
            })
            .expect(200);

        expect(response.headers['content-type']).toContain('text/event-stream');
        expect(response.headers['cache-control']).toBe('no-cache');
        expect(response.headers['x-hivepoint-subscription-id']).toBe('sub-1');
        expect(response.body).toBe('data: hello\n\n');
    });
});
