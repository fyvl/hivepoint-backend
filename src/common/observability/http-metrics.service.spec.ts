import { HttpMetricsService } from './http-metrics.service';

describe('HttpMetricsService', () => {
    it('aggregates request counts and durations by method, path, and status code', () => {
        const service = new HttpMetricsService();

        service.recordRequest({
            method: 'GET',
            path: '/health',
            statusCode: 200,
            durationMs: 10,
        });
        service.recordRequest({
            method: 'GET',
            path: '/health',
            statusCode: 200,
            durationMs: 15,
        });
        service.recordRequest({
            method: 'POST',
            path: '/auth/login',
            statusCode: 401,
            durationMs: 5,
        });

        expect(service.getSnapshot()).toEqual([
            {
                method: 'POST',
                path: '/auth/login',
                statusCode: 401,
                count: 1,
                durationSumMs: 5,
                durationMaxMs: 5,
            },
            {
                method: 'GET',
                path: '/health',
                statusCode: 200,
                count: 2,
                durationSumMs: 25,
                durationMaxMs: 15,
            },
        ]);
    });
});
