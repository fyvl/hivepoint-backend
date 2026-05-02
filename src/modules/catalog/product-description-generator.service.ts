import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import type { GenerateProductDescriptionInput } from './catalog.schemas';
import { GenerateProductDescriptionResponseDto } from './dto/generate-product-description-response.dto';

type ChatCompletionResponse = {
    choices?: Array<{
        message?: {
            content?:
                | string
                | Array<{
                      type?: string;
                      text?: string;
                  }>;
        };
    }>;
    error?: {
        message?: string;
    };
};

@Injectable()
export class ProductDescriptionGeneratorService {
    constructor(private readonly configService: AppConfigService) {}

    async generate(
        input: GenerateProductDescriptionInput,
    ): Promise<GenerateProductDescriptionResponseDto> {
        if (!this.configService.llmConfigured) {
            throw new AppError({
                code: ErrorCodes.LLM_NOT_CONFIGURED,
                message: 'LLM_NOT_CONFIGURED',
                httpStatus: 503,
            });
        }

        const abortController = new AbortController();
        const timeout = setTimeout(
            () => abortController.abort(),
            this.configService.llmRequestTimeoutMs,
        );

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (this.configService.llmApiKey) {
                headers.Authorization = `Bearer ${this.configService.llmApiKey}`;
            }

            const response = await fetch(
                `${this.normalizeBaseUrl(this.configService.llmBaseUrl)}/chat/completions`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: this.configService.llmModel,
                        temperature: 0.6,
                        max_tokens: 220,
                        messages: [
                            {
                                role: 'system',
                                content:
                                    'You write concise marketplace descriptions for API products. Return a plain-text description in one short paragraph, without markdown or quotes. Use the same language as the product input when it is clearly non-English; otherwise use English.',
                            },
                            {
                                role: 'user',
                                content: this.buildPrompt(input),
                            },
                        ],
                    }),
                    signal: abortController.signal,
                },
            );

            let payload: ChatCompletionResponse | null = null;
            try {
                payload = (await response.json()) as ChatCompletionResponse;
            } catch {
                payload = null;
            }

            if (!response.ok) {
                throw new AppError({
                    code: ErrorCodes.LLM_UPSTREAM_UNAVAILABLE,
                    message: 'LLM_UPSTREAM_UNAVAILABLE',
                    httpStatus: 502,
                    details: {
                        providerStatus: response.status,
                        providerMessage: payload?.error?.message,
                    },
                });
            }

            const description = this.extractDescription(payload);
            if (!description || description.length < 10) {
                throw new AppError({
                    code: ErrorCodes.LLM_UPSTREAM_UNAVAILABLE,
                    message: 'LLM_UPSTREAM_UNAVAILABLE',
                    httpStatus: 502,
                    details: {
                        reason: 'EMPTY_COMPLETION',
                    },
                });
            }

            return { description };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            throw new AppError({
                code: ErrorCodes.LLM_UPSTREAM_UNAVAILABLE,
                message: 'LLM_UPSTREAM_UNAVAILABLE',
                httpStatus: 502,
            });
        } finally {
            clearTimeout(timeout);
        }
    }

    private buildPrompt(input: GenerateProductDescriptionInput): string {
        const tags = input.tags.length > 0 ? input.tags.join(', ') : 'none';

        return [
            'Write a product description draft for an API marketplace listing.',
            `Title: ${input.title}`,
            `Category: ${input.category}`,
            `Tags: ${tags}`,
            'Requirements:',
            '- 2 or 3 sentences.',
            '- Concrete and useful, not hype-heavy.',
            '- Mention what the API enables and who would likely integrate it.',
            '- Do not invent benchmarks, compliance claims, or customer names.',
        ].join('\n');
    }

    private normalizeBaseUrl(baseUrl: string): string {
        return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }

    private extractDescription(payload: ChatCompletionResponse | null): string {
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
            return this.normalizeText(content);
        }

        if (Array.isArray(content)) {
            const text = content
                .map((item) =>
                    typeof item?.text === 'string' ? item.text : '',
                )
                .join(' ');
            return this.normalizeText(text);
        }

        return '';
    }

    private normalizeText(value: string): string {
        return value.replace(/\s+/g, ' ').trim();
    }
}
