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
            usage: {
                subscriptionId: 'sub-1',
                requestCount: 1,
                remainingRequests: 99,
                rateLimitRpm: 120,
                remainingRateLimitRequests: 119,
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
            rawBody: '{"echoed":true}',
            usage: {
                subscriptionId: 'sub-1',
                requestCount: 1,
                remainingRequests: 41,
                rateLimitRpm: 120,
                remainingRateLimitRequests: 40,
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
});