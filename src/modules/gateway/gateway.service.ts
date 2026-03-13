import { Injectable } from '@nestjs/common';
import { ProductStatus, VersionStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
import { GatewayDispatchResponseDto } from './dto/gateway-dispatch-response.dto';
import type { GatewayDispatchInput } from './gateway.schemas';

const GATEWAY_TIMEOUT_MS = 15_000;
const BLOCKED_REQUEST_HEADERS = new Set([
    'connection',
    'content-length',
    'host',
    'transfer-encoding',
    'x-api-key',
    'expect',
]);
const BLOCKED_RESPONSE_HEADERS = new Set([
    'connection',
    'content-length',
    'set-cookie',
    'transfer-encoding',
]);

export interface GatewayExecutionResult extends GatewayDispatchResponseDto {
    rawBody: string | null;
}

@Injectable()
export class GatewayService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly usageService: UsageService,
    ) {}

    async dispatch(
        input: GatewayDispatchInput,
        providedApiKey?: string,
    ): Promise<GatewayDispatchResponseDto> {
        const result = await this.execute(input, providedApiKey);

        return {
            ok: result.ok,
            status: result.status,
            method: result.method,
            upstreamUrl: result.upstreamUrl,
            contentType: result.contentType,
            headers: result.headers,
            body: result.body,
            usage: result.usage,
        };
    }

    async proxy(
        input: GatewayDispatchInput,
        providedApiKey?: string,
    ): Promise<GatewayExecutionResult> {
        return this.execute(input, providedApiKey);
    }

    private async execute(
        input: GatewayDispatchInput,
        providedApiKey?: string,
    ): Promise<GatewayExecutionResult> {
        const apiKey = providedApiKey?.trim();
        if (!apiKey) {
            throw new AppError({
                code: ErrorCodes.UNAUTHORIZED,
                message: 'API_KEY_REQUIRED',
                httpStatus: 401,
            });
        }

        const product = await this.prisma.apiProduct.findUnique({
            where: { id: input.productId },
            select: {
                id: true,
                title: true,
                status: true,
            },
        });

        if (!product) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_FOUND,
                message: 'PRODUCT_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (product.status !== ProductStatus.PUBLISHED) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_PUBLIC,
                message: 'PRODUCT_NOT_PUBLIC',
                httpStatus: 403,
            });
        }

        const version = await this.prisma.apiVersion.findFirst({
            where: {
                productId: input.productId,
                status: VersionStatus.PUBLISHED,
            },
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                version: true,
                openApiUrl: true,
                openApiSnapshot: true,
            },
        });

        if (!version) {
            throw new AppError({
                code: ErrorCodes.VERSION_NOT_FOUND,
                message: 'VERSION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const normalizedPath = this.normalizePath(input.path);
        const occurredAt = new Date().toISOString();
        const authorization = await this.usageService.authorizeGatewayUsage({
            apiKey,
            productId: input.productId,
            endpoint: normalizedPath,
            requestCount: input.requestCount,
            occurredAt,
            consume: false,
        });

        if (!authorization.allowed) {
            throw this.mapAuthorizationFailure(authorization.reason);
        }

        if (!authorization.subscriptionId) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_ACTIVE,
                message: 'SUBSCRIPTION_NOT_ACTIVE',
                httpStatus: 403,
            });
        }

        const upstreamBaseUrl = this.resolveUpstreamBaseUrl(
            version.openApiSnapshot,
            version.openApiUrl,
        );
        const upstreamUrl = this.buildUpstreamUrl(
            upstreamBaseUrl,
            normalizedPath,
            input.query,
        );
        const response = await this.fetchUpstream(upstreamUrl, input);
        const { parsedBody, rawBody } = await this.parseResponseBody(response);

        let usageRecorded = false;
        try {
            await this.usageService.recordAuthorizedUsage({
                subscriptionId: authorization.subscriptionId,
                endpoint: normalizedPath,
                requestCount: input.requestCount,
                occurredAt,
            });
            usageRecorded = true;
        } catch {
            usageRecorded = false;
        }

        const remainingRequests =
            typeof authorization.remainingRequests === 'number'
                ? Math.max(
                      0,
                      authorization.remainingRequests -
                          (usageRecorded ? input.requestCount : 0),
                  )
                : null;

        return {
            ok: response.ok,
            status: response.status,
            method: input.method,
            upstreamUrl,
            contentType: response.headers.get('content-type'),
            headers: this.serializeHeaders(response.headers),
            body: parsedBody,
            rawBody,
            usage: {
                subscriptionId: authorization.subscriptionId,
                requestCount: input.requestCount,
                remainingRequests,
                usageRecorded,
                periodEnd: authorization.periodEnd ?? null,
            },
        };
    }

    private mapAuthorizationFailure(reason?: string): AppError {
        switch (reason) {
            case 'INVALID_API_KEY':
                return new AppError({
                    code: ErrorCodes.INVALID_API_KEY,
                    message: 'INVALID_API_KEY',
                    httpStatus: 401,
                });
            case 'NO_ACTIVE_SUBSCRIPTION':
                return new AppError({
                    code: ErrorCodes.NO_ACTIVE_SUBSCRIPTION,
                    message: 'NO_ACTIVE_SUBSCRIPTION',
                    httpStatus: 403,
                });
            case 'QUOTA_EXCEEDED':
                return new AppError({
                    code: ErrorCodes.QUOTA_EXCEEDED,
                    message: 'QUOTA_EXCEEDED',
                    httpStatus: 429,
                });
            default:
                return new AppError({
                    code: ErrorCodes.FORBIDDEN,
                    message: 'GATEWAY_ACCESS_DENIED',
                    httpStatus: 403,
                });
        }
    }

    private normalizePath(path: string): string {
        const trimmed = path.trim();
        return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    }

    private resolveUpstreamBaseUrl(
        openApiSnapshot: string | null,
        openApiUrl: string,
    ): string {
        const serverUrl = this.extractServerUrl(openApiSnapshot);
        if (!serverUrl) {
            throw new AppError({
                code: ErrorCodes.GATEWAY_TARGET_NOT_CONFIGURED,
                message: 'GATEWAY_TARGET_NOT_CONFIGURED',
                httpStatus: 502,
            });
        }

        try {
            return new URL(serverUrl, openApiUrl).toString();
        } catch {
            throw new AppError({
                code: ErrorCodes.GATEWAY_TARGET_NOT_CONFIGURED,
                message: 'GATEWAY_TARGET_NOT_CONFIGURED',
                httpStatus: 502,
            });
        }
    }

    private extractServerUrl(
        openApiSnapshot: string | null,
    ): string | undefined {
        if (!openApiSnapshot) {
            return undefined;
        }

        const jsonServerUrl = this.extractServerUrlFromJson(openApiSnapshot);
        if (jsonServerUrl) {
            return jsonServerUrl;
        }

        return this.extractServerUrlFromYaml(openApiSnapshot);
    }

    private extractServerUrlFromJson(
        openApiSnapshot: string,
    ): string | undefined {
        try {
            const parsed = JSON.parse(openApiSnapshot) as Record<
                string,
                unknown
            >;
            if (Array.isArray(parsed.servers)) {
                const firstServer = parsed.servers.find(
                    (item) =>
                        typeof item === 'object' &&
                        item !== null &&
                        'url' in item,
                ) as { url?: unknown } | undefined;
                if (
                    typeof firstServer?.url === 'string' &&
                    firstServer.url.trim()
                ) {
                    return firstServer.url.trim();
                }
            }

            const host =
                typeof parsed.host === 'string' ? parsed.host.trim() : '';
            if (!host) {
                return undefined;
            }

            const basePath =
                typeof parsed.basePath === 'string'
                    ? parsed.basePath.trim()
                    : '';
            const firstScheme = Array.isArray(parsed.schemes)
                ? parsed.schemes.find((item) => typeof item === 'string')
                : undefined;

            return `${firstScheme ?? 'https'}://${host}${basePath}`;
        } catch {
            return undefined;
        }
    }

    private extractServerUrlFromYaml(
        openApiSnapshot: string,
    ): string | undefined {
        const serversBlock = openApiSnapshot.match(
            /(?:^|\n)servers:\s*([\s\S]*?)(?:\n[^\s-][^:\n]*:|\s*$)/,
        );
        const serverUrl = serversBlock?.[1].match(
            /-\s*url:\s*['"]?([^\n'"]+)['"]?/,
        );
        if (serverUrl?.[1]) {
            return serverUrl[1].trim();
        }

        const host = openApiSnapshot
            .match(/^\s*host:\s*['"]?([^\n'"]+)['"]?/m)?.[1]
            ?.trim();
        if (!host) {
            return undefined;
        }

        const basePath =
            openApiSnapshot
                .match(/^\s*basePath:\s*['"]?([^\n'"]+)['"]?/m)?.[1]
                ?.trim() ?? '';
        const scheme =
            openApiSnapshot.match(
                /^\s*-\s*['"]?(https?|wss?)['"]?\s*$/m,
            )?.[1] ?? 'https';

        return `${scheme}://${host}${basePath}`;
    }

    private buildUpstreamUrl(
        upstreamBaseUrl: string,
        path: string,
        query: Record<string, string | number | boolean>,
    ): string {
        const baseUrl = new URL(upstreamBaseUrl);
        const [pathOnly, inlineQuery] = path.split('?', 2);
        const normalizedBasePath = baseUrl.pathname.endsWith('/')
            ? baseUrl.pathname.slice(0, -1)
            : baseUrl.pathname;
        const normalizedPath = pathOnly.startsWith('/')
            ? pathOnly
            : `/${pathOnly}`;

        baseUrl.pathname = `${normalizedBasePath}${normalizedPath}`.replace(
            /\/{2,}/g,
            '/',
        );

        const searchParams = new URLSearchParams(inlineQuery ?? '');
        Object.entries(query).forEach(([key, value]) => {
            searchParams.set(key, String(value));
        });
        baseUrl.search = searchParams.toString();

        return baseUrl.toString();
    }

    private async fetchUpstream(
        upstreamUrl: string,
        input: GatewayDispatchInput,
    ): Promise<Response> {
        const abortController = new AbortController();
        const timeout = setTimeout(
            () => abortController.abort(),
            GATEWAY_TIMEOUT_MS,
        );
        const requestHeaders = this.buildRequestHeaders(input.headers);
        const requestBody = this.buildRequestBody(
            input.method,
            input.body,
            requestHeaders,
        );

        try {
            return await fetch(upstreamUrl, {
                method: input.method,
                headers: requestHeaders,
                body: requestBody,
                signal: abortController.signal,
            });
        } catch {
            throw new AppError({
                code: ErrorCodes.GATEWAY_UPSTREAM_UNAVAILABLE,
                message: 'GATEWAY_UPSTREAM_UNAVAILABLE',
                httpStatus: 502,
                details: {
                    upstreamUrl,
                },
            });
        } finally {
            clearTimeout(timeout);
        }
    }

    private buildRequestHeaders(headers: Record<string, string>): Headers {
        const requestHeaders = new Headers();

        Object.entries(headers).forEach(([key, value]) => {
            if (!value) {
                return;
            }

            const normalizedKey = key.toLowerCase();
            if (BLOCKED_REQUEST_HEADERS.has(normalizedKey)) {
                return;
            }

            requestHeaders.set(key, value);
        });

        if (!requestHeaders.has('accept')) {
            requestHeaders.set(
                'accept',
                'application/json, text/plain;q=0.9, */*;q=0.1',
            );
        }

        return requestHeaders;
    }

    private buildRequestBody(
        method: GatewayDispatchInput['method'],
        body: unknown,
        requestHeaders: Headers,
    ): BodyInit | undefined {
        if (body === undefined || method === 'GET') {
            return undefined;
        }

        if (typeof body === 'string') {
            return body;
        }

        if (!requestHeaders.has('content-type')) {
            requestHeaders.set('content-type', 'application/json');
        }

        return JSON.stringify(body);
    }

    private async parseResponseBody(
        response: Response,
    ): Promise<{ parsedBody: unknown; rawBody: string | null }> {
        const text = await response.text();
        if (!text) {
            return {
                parsedBody: null,
                rawBody: null,
            };
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            try {
                return {
                    parsedBody: JSON.parse(text),
                    rawBody: text,
                };
            } catch {
                return {
                    parsedBody: text,
                    rawBody: text,
                };
            }
        }

        return {
            parsedBody: text,
            rawBody: text,
        };
    }

    private serializeHeaders(headers: Headers): Record<string, string> {
        const result: Record<string, string> = {};

        headers.forEach((value, key) => {
            if (BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) {
                return;
            }

            result[key] = value;
        });

        return result;
    }
}
