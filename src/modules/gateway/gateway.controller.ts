import {
    All,
    Body,
    Controller,
    Headers,
    HttpCode,
    Param,
    Post,
    Req,
    Res,
} from '@nestjs/common';
import {
    ApiBadGatewayResponse,
    ApiBody,
    ApiForbiddenResponse,
    ApiHeader,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { ZodValidationPipe } from '../../common/utils/zod-validation.pipe';
import { GatewayDispatchDto } from './dto/gateway-dispatch.dto';
import { GatewayDispatchResponseDto } from './dto/gateway-dispatch-response.dto';
import { GatewayService } from './gateway.service';
import { gatewayDispatchSchema } from './gateway.schemas';
import type { GatewayDispatchInput } from './gateway.schemas';

const gatewayValidationPipe = new ZodValidationPipe(gatewayDispatchSchema);
const SUPPORTED_PROXY_METHODS = new Set<GatewayDispatchInput['method']>([
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
]);

@ApiTags('gateway')
@Controller('gateway')
export class GatewayController {
    constructor(private readonly gatewayService: GatewayService) {}

    @Post('dispatch')
    @HttpCode(200)
    @ApiOperation({
        summary:
            'Forward a request to the seller API through HivePoint gateway',
    })
    @ApiHeader({
        name: 'x-api-key',
        required: true,
        description:
            'HivePoint API key used for subscription and quota validation.',
    })
    @ApiBody({ type: GatewayDispatchDto })
    @ApiOkResponse({ type: GatewayDispatchResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED or INVALID_API_KEY' })
    @ApiForbiddenResponse({
        description: 'PRODUCT_NOT_PUBLIC or NO_ACTIVE_SUBSCRIPTION',
    })
    @ApiNotFoundResponse({
        description: 'PRODUCT_NOT_FOUND or VERSION_NOT_FOUND',
    })
    @ApiTooManyRequestsResponse({
        description: 'QUOTA_EXCEEDED or RATE_LIMIT_EXCEEDED',
    })
    @ApiBadGatewayResponse({
        description:
            'GATEWAY_TARGET_NOT_CONFIGURED or GATEWAY_UPSTREAM_UNAVAILABLE',
    })
    async dispatch(
        @Body(new ZodValidationPipe(gatewayDispatchSchema))
        body: GatewayDispatchInput,
        @Headers('x-api-key') apiKey?: string,
    ): Promise<GatewayDispatchResponseDto> {
        return this.gatewayService.dispatch(body, apiKey);
    }

    @All(['products/:productId', 'products/:productId/*proxyPath'])
    @ApiOperation({
        summary:
            'Proxy a direct HTTP request to the seller API through HivePoint gateway',
    })
    @ApiHeader({
        name: 'x-api-key',
        required: true,
        description:
            'HivePoint API key used for subscription and quota validation.',
    })
    @ApiParam({ name: 'productId', description: 'Target API product id.' })
    @ApiOkResponse({
        description:
            'Returns the upstream response status, headers, and body directly.',
    })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED or INVALID_API_KEY' })
    @ApiForbiddenResponse({
        description: 'PRODUCT_NOT_PUBLIC or NO_ACTIVE_SUBSCRIPTION',
    })
    @ApiNotFoundResponse({
        description: 'PRODUCT_NOT_FOUND or VERSION_NOT_FOUND',
    })
    @ApiTooManyRequestsResponse({
        description: 'QUOTA_EXCEEDED or RATE_LIMIT_EXCEEDED',
    })
    @ApiBadGatewayResponse({
        description:
            'GATEWAY_TARGET_NOT_CONFIGURED or GATEWAY_UPSTREAM_UNAVAILABLE',
    })
    async proxy(
        @Param('productId') productId: string,
        @Req() request: Request,
        @Res() response: Response,
        @Headers('x-api-key') apiKey?: string,
    ): Promise<void> {
        const result = await this.gatewayService.proxy(
            gatewayValidationPipe.transform({
                productId,
                path: this.resolveProxyPath(request),
                method: this.normalizeProxyMethod(request.method),
                headers: this.normalizeProxyHeaders(request),
                query: this.normalizeProxyQuery(request.query),
                body: this.readProxyBody(request),
                requestCount: 1,
            }),
            apiKey,
        );

        Object.entries(result.headers).forEach(([key, value]) => {
            response.setHeader(key, value);
        });
        response.setHeader(
            'x-hivepoint-subscription-id',
            result.usage.subscriptionId,
        );
        response.setHeader(
            'x-hivepoint-request-count',
            String(result.usage.requestCount),
        );
        response.setHeader(
            'x-hivepoint-usage-recorded',
            String(result.usage.usageRecorded),
        );
        if (typeof result.usage.remainingRequests === 'number') {
            response.setHeader(
                'x-hivepoint-remaining-requests',
                String(result.usage.remainingRequests),
            );
        }
        if (typeof result.usage.rateLimitRpm === 'number') {
            response.setHeader(
                'x-hivepoint-rate-limit-rpm',
                String(result.usage.rateLimitRpm),
            );
        }
        if (
            typeof result.usage.remainingRateLimitRequests === 'number'
        ) {
            response.setHeader(
                'x-hivepoint-rate-limit-remaining',
                String(result.usage.remainingRateLimitRequests),
            );
        }
        if (result.usage.periodEnd) {
            response.setHeader(
                'x-hivepoint-period-end',
                result.usage.periodEnd.toISOString(),
            );
        }

        response.status(result.status);
        if (result.rawBody === null) {
            response.send();
            return;
        }

        response.send(result.rawBody);
    }

    private resolveProxyPath(request: Request): string {
        const params = request.params as Record<
            string,
            string | string[] | undefined
        >;
        const rawPath = params.proxyPath ?? params['0'];

        if (Array.isArray(rawPath)) {
            return rawPath.length > 0 ? `/${rawPath.join('/')}` : '/';
        }

        if (typeof rawPath === 'string' && rawPath.trim()) {
            return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
        }

        return '/';
    }

    private normalizeProxyMethod(
        method: string,
    ): GatewayDispatchInput['method'] {
        const normalizedMethod = method.toUpperCase();
        if (
            SUPPORTED_PROXY_METHODS.has(
                normalizedMethod as GatewayDispatchInput['method'],
            )
        ) {
            return normalizedMethod as GatewayDispatchInput['method'];
        }

        throw new AppError({
            code: ErrorCodes.BAD_REQUEST,
            message: 'GATEWAY_METHOD_NOT_SUPPORTED',
            httpStatus: 400,
            details: {
                method,
            },
        });
    }

    private normalizeProxyHeaders(request: Request): Record<string, string> {
        const headers: Record<string, string> = {};

        Object.entries(request.headers).forEach(([key, value]) => {
            if (!value) {
                return;
            }

            headers[key] = Array.isArray(value) ? value.join(', ') : value;
        });

        return headers;
    }

    private normalizeProxyQuery(
        query: Request['query'],
    ): Record<string, string> {
        const normalizedQuery: Record<string, string> = {};

        Object.entries(query).forEach(([key, value]) => {
            const normalizedValue = this.normalizeQueryValue(value);
            if (normalizedValue !== undefined) {
                normalizedQuery[key] = normalizedValue;
            }
        });

        return normalizedQuery;
    }

    private normalizeQueryValue(value: unknown): string | undefined {
        if (value === undefined || value === null) {
            return undefined;
        }

        if (Array.isArray(value)) {
            const values = value as unknown[];
            const lastValue =
                values.length > 0 ? values[values.length - 1] : undefined;
            return this.normalizeQueryValue(lastValue);
        }

        if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'bigint'
        ) {
            return value.toString();
        }

        if (typeof value === 'symbol') {
            return value.toString();
        }

        try {
            return JSON.stringify(value);
        } catch {
            return Object.prototype.toString.call(value);
        }
    }

    private readProxyBody(request: Request): unknown {
        const hasBody =
            request.headers['content-length'] !== undefined ||
            request.headers['transfer-encoding'] !== undefined;

        if (!hasBody) {
            return undefined;
        }

        return request.body;
    }
}
