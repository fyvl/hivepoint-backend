import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import type { SuggestProductCategoryInput } from './catalog.schemas';
import { SuggestProductCategoryResponseDto } from './dto/suggest-product-category-response.dto';

type MlClassifyResponse = {
    category?: unknown;
    categoryScore?: unknown;
    tags?: unknown;
    method?: unknown;
    model?: unknown;
};

type MlTagSuggestion = {
    tag?: unknown;
    score?: unknown;
};

@Injectable()
export class ProductCategorySuggestionService {
    constructor(private readonly configService: AppConfigService) {}

    async suggest(
        input: SuggestProductCategoryInput,
    ): Promise<SuggestProductCategoryResponseDto> {
        if (!this.configService.mlSuggestionsEnabled) {
            throw new AppError({
                code: ErrorCodes.ML_SUGGESTIONS_DISABLED,
                message: 'ML_SUGGESTIONS_DISABLED',
                httpStatus: 503,
            });
        }

        const abortController = new AbortController();
        const timeout = setTimeout(
            () => abortController.abort(),
            this.configService.mlRequestTimeoutMs,
        );

        try {
            const response = await fetch(
                `${this.normalizeBaseUrl(this.configService.mlServiceUrl)}/classify`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        title: input.title,
                        description: input.description,
                        topKTags: input.topKTags ?? 3,
                    }),
                    signal: abortController.signal,
                },
            );

            let payload: MlClassifyResponse | null = null;
            try {
                payload = (await response.json()) as MlClassifyResponse;
            } catch {
                payload = null;
            }

            if (!response.ok || !payload) {
                throw new AppError({
                    code: ErrorCodes.ML_UPSTREAM_UNAVAILABLE,
                    message: 'ML_UPSTREAM_UNAVAILABLE',
                    httpStatus: 502,
                    details: {
                        providerStatus: response.status,
                        providerPayload: payload,
                    },
                });
            }

            return this.normalizePayload(payload);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            throw new AppError({
                code: ErrorCodes.ML_UPSTREAM_UNAVAILABLE,
                message: 'ML_UPSTREAM_UNAVAILABLE',
                httpStatus: 502,
            });
        } finally {
            clearTimeout(timeout);
        }
    }

    private normalizeBaseUrl(baseUrl: string): string {
        return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }

    private normalizePayload(
        payload: MlClassifyResponse,
    ): SuggestProductCategoryResponseDto {
        const category =
            typeof payload.category === 'string' ? payload.category : '';
        const categoryScore =
            typeof payload.categoryScore === 'number'
                ? payload.categoryScore
                : 0;
        const method = typeof payload.method === 'string' ? payload.method : '';
        const model = typeof payload.model === 'string' ? payload.model : '';
        const tags = Array.isArray(payload.tags)
            ? payload.tags
                  .map((item) => this.normalizeTag(item as MlTagSuggestion))
                  .filter((item) => item.tag.length > 0)
            : [];

        if (!category || tags.length === 0) {
            throw new AppError({
                code: ErrorCodes.ML_UPSTREAM_UNAVAILABLE,
                message: 'ML_UPSTREAM_UNAVAILABLE',
                httpStatus: 502,
                details: {
                    reason: 'INVALID_ML_PAYLOAD',
                    payload,
                },
            });
        }

        return {
            category,
            categoryScore,
            tags,
            method,
            model,
        };
    }

    private normalizeTag(item: MlTagSuggestion): { tag: string; score: number } {
        return {
            tag: typeof item.tag === 'string' ? item.tag : '',
            score: typeof item.score === 'number' ? item.score : 0,
        };
    }
}
