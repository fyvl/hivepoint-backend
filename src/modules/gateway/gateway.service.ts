import { Injectable } from '@nestjs/common';
import { ProductStatus, VersionStatus } from '@prisma/client';
import { AppConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertSafeExternalHttpUrl } from '../../common/utils/external-url';
import { GatewayBurstLimiterService } from './gateway-burst-limiter.service';
import { UsageService } from '../usage/usage.service';
import {
    GatewayBodyEncoding,
    GatewayDispatchResponseDto,
} from './dto/gateway-dispatch-response.dto';
import type { GatewayDispatchInput } from './gateway.schemas';

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
const TEXT_CONTENT_TYPE_MARKERS = [
    'text/',
    '/xml',
    '+xml',
    'application/javascript',
    'application/ecmascript',
    'application/x-www-form-urlencoded',
];
const STREAMING_CONTENT_TYPE_MARKERS = [
    'text/event-stream',
    'application/x-ndjson',
];

export interface GatewayExecutionResult extends GatewayDispatchResponseDto {
    rawBody: Buffer | null;
    responseStream: ReadableStream<Uint8Array> | null;
}

type GatewayExecutionOptions = {
    proxyMode: boolean;
};

@Injectable()
export class GatewayService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly usageService: UsageService,
        private readonly configService: AppConfigService,
        private readonly gatewayBurstLimiterService: GatewayBurstLimiterService,
    ) {}

    async dispatch(
        input: GatewayDispatchInput,
        providedApiKey?: string,
    ): Promise<GatewayDispatchResponseDto> {
        const result = await this.execute(input, providedApiKey, {
            proxyMode: false,
        });

        return {
            ok: result.ok,
            status: result.status,
            method: result.method,
            upstreamUrl: result.upstreamUrl,
            contentType: result.contentType,
            headers: result.headers,
            body: result.body,
            bodyEncoding: result.bodyEncoding,
            usage: result.usage,
        };
    }

    async proxy(
        input: GatewayDispatchInput,
        providedApiKey?: string,
    ): Promise<GatewayExecutionResult> {
        return this.execute(input, providedApiKey, { proxyMode: true });
    }

    private async execute(
        input: GatewayDispatchInput,
        providedApiKey: string | undefined,
        options: GatewayExecutionOptions,
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
        const preliminaryAuthorization =
            await this.usageService.authorizeGatewayUsage({
                apiKey,
                productId: input.productId,
                endpoint: normalizedPath,
                requestCount: input.requestCount,
                occurredAt,
                consume: false,
            });

        if (!preliminaryAuthorization.allowed) {
            throw this.mapAuthorizationFailure(
                preliminaryAuthorization.reason,
            );
        }

        if (!preliminaryAuthorization.subscriptionId) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_ACTIVE,
                message: 'SUBSCRIPTION_NOT_ACTIVE',
                httpStatus: 403,
            });
        }

        const burstLimitDecision =
            await this.gatewayBurstLimiterService.checkAndConsume({
                key: preliminaryAuthorization.subscriptionId,
                requestCount: input.requestCount,
                rateLimitRpm: preliminaryAuthorization.rateLimitRpm ?? null,
            });

        if (!burstLimitDecision.allowed) {
            throw this.mapBurstLimitFailure(burstLimitDecision);
        }

        const authorization = await this.usageService.authorizeGatewayUsage({
            apiKey,
            productId: input.productId,
            endpoint: normalizedPath,
            requestCount: input.requestCount,
            occurredAt,
            consume: true,
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

        const upstreamBaseUrl = await this.resolveUpstreamBaseUrl(
            version.openApiSnapshot,
            version.openApiUrl,
        );
        const upstreamUrl = await this.buildUpstreamUrl(
            upstreamBaseUrl,
            normalizedPath,
            input.query,
        );
        const response = await this.fetchUpstream(upstreamUrl, input);
        if (options.proxyMode && this.shouldStreamProxyResponse(response)) {
            return {
                ok: response.ok,
                status: response.status,
                method: input.method,
                upstreamUrl,
                contentType: response.headers.get('content-type'),
                headers: this.serializeHeaders(response.headers),
                body: null,
                bodyEncoding: null,
                rawBody: null,
                responseStream: response.body,
                usage: {
                    subscriptionId: authorization.subscriptionId,
                    requestCount: input.requestCount,
                    remainingRequests:
                        typeof authorization.remainingRequests === 'number'
                            ? authorization.remainingRequests
                            : null,
                    rateLimitRpm:
                        typeof authorization.rateLimitRpm === 'number'
                            ? authorization.rateLimitRpm
                            : null,
                    remainingRateLimitRequests:
                        typeof authorization.remainingRateLimitRequests ===
                        'number'
                            ? authorization.remainingRateLimitRequests
                            : null,
                    burstLimit: burstLimitDecision.burstLimit,
                    remainingBurstRequests:
                        burstLimitDecision.remainingBurstRequests,
                    burstWindowSeconds:
                        burstLimitDecision.burstWindowSeconds,
                    usageRecorded: authorization.usageRecorded === true,
                    periodEnd: authorization.periodEnd ?? null,
                },
            };
        }

        const { parsedBody, rawBody, bodyEncoding } =
            await this.parseResponseBody(response);

        return {
            ok: response.ok,
            status: response.status,
            method: input.method,
            upstreamUrl,
            contentType: response.headers.get('content-type'),
            headers: this.serializeHeaders(response.headers),
            body: parsedBody,
            bodyEncoding,
            rawBody: options.proxyMode ? rawBody : null,
            responseStream: null,
            usage: {
                subscriptionId: authorization.subscriptionId,
                requestCount: input.requestCount,
                remainingRequests:
                    typeof authorization.remainingRequests === 'number'
                        ? authorization.remainingRequests
                        : null,
                rateLimitRpm:
                    typeof authorization.rateLimitRpm === 'number'
                        ? authorization.rateLimitRpm
                        : null,
                remainingRateLimitRequests:
                    typeof authorization.remainingRateLimitRequests ===
                    'number'
                        ? authorization.remainingRateLimitRequests
                        : null,
                burstLimit: burstLimitDecision.burstLimit,
                remainingBurstRequests:
                    burstLimitDecision.remainingBurstRequests,
                burstWindowSeconds: burstLimitDecision.burstWindowSeconds,
                usageRecorded: authorization.usageRecorded === true,
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
            case 'RATE_LIMIT_EXCEEDED':
                return new AppError({
                    code: ErrorCodes.RATE_LIMIT_EXCEEDED,
                    message: 'RATE_LIMIT_EXCEEDED',
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

    private mapBurstLimitFailure(details: {
        burstLimit: number | null;
        remainingBurstRequests: number | null;
        burstWindowSeconds: number | null;
        retryAfterSeconds: number | null;
    }): AppError {
        return new AppError({
            code: ErrorCodes.RATE_LIMIT_EXCEEDED,
            message: 'RATE_LIMIT_EXCEEDED',
            httpStatus: 429,
            details: {
                policy: 'gateway-burst',
                burstLimit: details.burstLimit,
                remainingBurstRequests: details.remainingBurstRequests,
                burstWindowSeconds: details.burstWindowSeconds,
                retryAfterSeconds: details.retryAfterSeconds,
            },
        });
    }

    private normalizePath(path: string): string {
        const trimmed = path.trim();
        return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    }

    private async resolveUpstreamBaseUrl(
        openApiSnapshot: string | null,
        openApiUrl: string,
    ): Promise<string> {
        const serverUrl = this.extractServerUrl(openApiSnapshot);
        if (!serverUrl) {
            throw new AppError({
                code: ErrorCodes.GATEWAY_TARGET_NOT_CONFIGURED,
                message: 'GATEWAY_TARGET_NOT_CONFIGURED',
                httpStatus: 502,
            });
        }

        let resolvedUrl: string;
        try {
            resolvedUrl = new URL(serverUrl, openApiUrl).toString();
        } catch {
            throw new AppError({
                code: ErrorCodes.GATEWAY_TARGET_NOT_CONFIGURED,
                message: 'GATEWAY_TARGET_NOT_CONFIGURED',
                httpStatus: 502,
            });
        }

        await assertSafeExternalHttpUrl(resolvedUrl, {
            allowPrivateNetworkTargets:
                this.configService.allowPrivateNetworkTargets,
            message: 'UPSTREAM_URL_NOT_ALLOWED',
            httpStatus: 502,
        });

        return resolvedUrl;
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

    private async buildUpstreamUrl(
        upstreamBaseUrl: string,
        path: string,
        query: Record<string, string | number | boolean>,
    ): Promise<string> {
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

        const upstreamUrl = baseUrl.toString();
        await assertSafeExternalHttpUrl(upstreamUrl, {
            allowPrivateNetworkTargets:
                this.configService.allowPrivateNetworkTargets,
            message: 'UPSTREAM_URL_NOT_ALLOWED',
            httpStatus: 502,
        });

        return upstreamUrl;
    }

    private async fetchUpstream(
        upstreamUrl: string,
        input: GatewayDispatchInput,
    ): Promise<Response> {
        const abortController = new AbortController();
        const timeout = setTimeout(
            () => abortController.abort(),
            this.configService.gatewayUpstreamTimeoutMs,
        );
        const requestHeaders = this.buildRequestHeaders(input.headers);
        const requestBody = this.buildRequestBody(
            input.method,
            input.body,
            requestHeaders,
        );

        this.assertRequestBodySize(requestBody);

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

        if (Buffer.isBuffer(body)) {
            return new Uint8Array(body) as unknown as BodyInit;
        }

        if (body instanceof ArrayBuffer) {
            return new Uint8Array(body) as unknown as BodyInit;
        }

        if (ArrayBuffer.isView(body)) {
            return new Uint8Array(body.buffer, body.byteOffset, body.byteLength) as unknown as BodyInit;
        }

        if (!requestHeaders.has('content-type')) {
            requestHeaders.set('content-type', 'application/json');
        }

        return JSON.stringify(body);
    }

    private assertRequestBodySize(body: BodyInit | undefined): void {
        const sizeBytes = this.getBodySizeBytes(body);
        if (sizeBytes <= this.configService.gatewayRequestBodyLimitBytes) {
            return;
        }

        throw new AppError({
            code: ErrorCodes.GATEWAY_REQUEST_BODY_TOO_LARGE,
            message: 'GATEWAY_REQUEST_BODY_TOO_LARGE',
            httpStatus: 413,
            details: {
                actualBytes: sizeBytes,
                limitBytes: this.configService.gatewayRequestBodyLimitBytes,
            },
        });
    }

    private getBodySizeBytes(body: BodyInit | undefined): number {
        if (body === undefined) {
            return 0;
        }

        if (typeof body === 'string') {
            return Buffer.byteLength(body);
        }

        if (body instanceof URLSearchParams) {
            return Buffer.byteLength(body.toString());
        }

        if (body instanceof Blob) {
            return body.size;
        }

        if (body instanceof ArrayBuffer) {
            return body.byteLength;
        }

        if (ArrayBuffer.isView(body)) {
            return body.byteLength;
        }

        return 0;
    }

    private async parseResponseBody(response: Response): Promise<{
        parsedBody: unknown;
        rawBody: Buffer | null;
        bodyEncoding: GatewayBodyEncoding;
    }> {
        const rawBody = await this.readResponseBody(response);
        if (!rawBody || rawBody.length === 0) {
            return {
                parsedBody: null,
                rawBody: null,
                bodyEncoding: null,
            };
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (this.isJsonContentType(contentType)) {
            const text = rawBody.toString('utf8');
            try {
                return {
                    parsedBody: JSON.parse(text),
                    rawBody,
                    bodyEncoding: 'json',
                };
            } catch {
                return {
                    parsedBody: text,
                    rawBody,
                    bodyEncoding: 'text',
                };
            }
        }

        if (this.isTextContentType(contentType)) {
            return {
                parsedBody: rawBody.toString('utf8'),
                rawBody,
                bodyEncoding: 'text',
            };
        }

        return {
            parsedBody: rawBody.toString('base64'),
            rawBody,
            bodyEncoding: 'base64',
        };
    }

    private async readResponseBody(response: Response): Promise<Buffer | null> {
        if (!response.body) {
            const buffer = Buffer.from(await response.arrayBuffer());
            this.assertResponseBodySize(buffer.length);
            return buffer.length > 0 ? buffer : null;
        }

        const reader = response.body.getReader();
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            if (!value) {
                continue;
            }

            totalBytes += value.byteLength;
            this.assertResponseBodySize(totalBytes);
            chunks.push(Buffer.from(value));
        }

        return totalBytes > 0 ? Buffer.concat(chunks, totalBytes) : null;
    }

    private shouldStreamProxyResponse(response: Response): boolean {
        if (!response.body) {
            return false;
        }

        const contentType = (response.headers.get('content-type') ?? '')
            .trim()
            .toLowerCase();

        return STREAMING_CONTENT_TYPE_MARKERS.some((marker) =>
            contentType.includes(marker),
        );
    }

    private assertResponseBodySize(sizeBytes: number): void {
        if (sizeBytes <= this.configService.gatewayResponseBodyLimitBytes) {
            return;
        }

        throw new AppError({
            code: ErrorCodes.GATEWAY_RESPONSE_BODY_TOO_LARGE,
            message: 'GATEWAY_RESPONSE_BODY_TOO_LARGE',
            httpStatus: 502,
            details: {
                actualBytes: sizeBytes,
                limitBytes: this.configService.gatewayResponseBodyLimitBytes,
            },
        });
    }

    private isJsonContentType(contentType: string): boolean {
        const normalizedContentType = contentType.toLowerCase();
        return (
            normalizedContentType.includes('/json') ||
            normalizedContentType.includes('+json')
        );
    }

    private isTextContentType(contentType: string): boolean {
        const normalizedContentType = contentType.toLowerCase();
        if (normalizedContentType.length === 0) {
            return true;
        }

        return TEXT_CONTENT_TYPE_MARKERS.some((marker) =>
            normalizedContentType.includes(marker),
        );
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











