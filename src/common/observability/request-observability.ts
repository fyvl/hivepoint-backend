import { INestApplication, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import type { AuthenticatedUser } from '../decorators/user.decorator';
import { HttpMetricsService } from './http-metrics.service';
import { RequestContextService } from './request-context.service';

type RequestWithContext = Request & {
    requestId?: string;
    user?: AuthenticatedUser;
};

const logger = new Logger('HttpRequest');

const normalizeRequestId = (value: string | string[] | undefined): string => {
    const candidate = Array.isArray(value) ? value[0] : value;
    const normalized = candidate?.trim();
    return normalized && normalized.length > 0 ? normalized : randomUUID();
};

export const applyRequestObservability = (app: INestApplication): void => {
    const requestContextService = app.get(RequestContextService);
    const httpMetricsService = app.get(HttpMetricsService);

    app.use((req: Request, res: Response, next: NextFunction) => {
        const request = req as RequestWithContext;
        const requestId = normalizeRequestId(req.headers['x-request-id']);
        const startedAt = process.hrtime.bigint();

        request.requestId = requestId;
        res.setHeader('x-request-id', requestId);

        requestContextService.run({ requestId }, () => {
            res.on('finish', () => {
                const durationMs =
                    Number(process.hrtime.bigint() - startedAt) / 1_000_000;
                const normalizedPath = normalizePathLabel(
                    request.path ||
                        request.originalUrl ||
                        request.url.split('?', 1)[0] ||
                        '/',
                );

                httpMetricsService.recordRequest({
                    method: request.method,
                    path: normalizedPath,
                    statusCode: res.statusCode,
                    durationMs,
                });

                logger.log(
                    JSON.stringify({
                        requestId,
                        method: request.method,
                        path: request.originalUrl || request.url,
                        normalizedPath,
                        statusCode: res.statusCode,
                        durationMs: Number(durationMs.toFixed(2)),
                        userId: request.user?.id ?? null,
                        userRole: request.user?.role ?? null,
                    }),
                );
            });

            next();
        });
    });
};

const UUID_SEGMENT_PATTERN =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const NUMERIC_SEGMENT_PATTERN = /\/\d+(?=\/|$)/g;

const normalizePathLabel = (path: string): string => {
    const withoutQuery = path.split('?', 1)[0] || '/';
    const normalized = withoutQuery
        .replace(UUID_SEGMENT_PATTERN, ':id')
        .replace(NUMERIC_SEGMENT_PATTERN, '/:id');

    return normalized.length > 0 ? normalized : '/';
};
