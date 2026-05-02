import { AppConfigService } from '../../common/config/config.service';
import { ErrorCodes } from '../../common/errors/error.codes';
import { ProductDescriptionGeneratorService } from './product-description-generator.service';

describe('ProductDescriptionGeneratorService', () => {
    let service: ProductDescriptionGeneratorService;
    let configService: AppConfigService;
    let fetchMock: jest.Mock;
    const originalFetch = global.fetch;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as typeof fetch;

        configService = {
            llmConfigured: true,
            llmApiKey: 'test-key',
            llmModel: 'test-model',
            llmBaseUrl: 'https://llm.example.com/v1',
            llmRequestTimeoutMs: 5_000,
        } as AppConfigService;

        service = new ProductDescriptionGeneratorService(configService);
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('generates a description from provider response', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [
                    {
                        message: {
                            content:
                                'Accept payments, invoice workflows, and card events through a single API surface for commerce teams.',
                        },
                    },
                ],
            }),
        });

        const result = await service.generate({
            title: 'Payments API',
            category: 'payments',
            tags: ['payments', 'cards'],
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://llm.example.com/v1/chat/completions',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-key',
                }),
            }),
        );
        expect(result.description).toContain('Accept payments');
    });

    it('fails when llm config is missing', async () => {
        service = new ProductDescriptionGeneratorService({
            llmConfigured: false,
        } as AppConfigService);

        await expect(
            service.generate({
                title: 'Payments API',
                category: 'payments',
                tags: [],
            }),
        ).rejects.toMatchObject({
            code: ErrorCodes.LLM_NOT_CONFIGURED,
        });
    });

    it('maps provider failures to llm upstream error', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({
                error: {
                    message: 'rate limited',
                },
            }),
        });

        await expect(
            service.generate({
                title: 'Payments API',
                category: 'payments',
                tags: [],
            }),
        ).rejects.toMatchObject({
            code: ErrorCodes.LLM_UPSTREAM_UNAVAILABLE,
        });
    });
});
