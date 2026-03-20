import { Injectable } from '@nestjs/common';

type HttpMetricRecord = {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
};

export type HttpMetricSnapshotItem = {
    method: string;
    path: string;
    statusCode: number;
    count: number;
    durationSumMs: number;
    durationMaxMs: number;
};

@Injectable()
export class HttpMetricsService {
    private readonly requestMetrics = new Map<
        string,
        {
            method: string;
            path: string;
            statusCode: number;
            count: number;
            durationSumMs: number;
            durationMaxMs: number;
        }
    >();

    recordRequest(metric: HttpMetricRecord): void {
        const key = `${metric.method}:${metric.path}:${metric.statusCode}`;
        const existing = this.requestMetrics.get(key);

        if (!existing) {
            this.requestMetrics.set(key, {
                method: metric.method,
                path: metric.path,
                statusCode: metric.statusCode,
                count: 1,
                durationSumMs: metric.durationMs,
                durationMaxMs: metric.durationMs,
            });
            return;
        }

        existing.count += 1;
        existing.durationSumMs += metric.durationMs;
        existing.durationMaxMs = Math.max(
            existing.durationMaxMs,
            metric.durationMs,
        );
    }

    getSnapshot(): HttpMetricSnapshotItem[] {
        return [...this.requestMetrics.values()]
            .map((item) => ({ ...item }))
            .sort((a, b) => {
                if (a.path === b.path) {
                    if (a.method === b.method) {
                        return a.statusCode - b.statusCode;
                    }

                    return a.method.localeCompare(b.method);
                }

                return a.path.localeCompare(b.path);
            });
    }
}
