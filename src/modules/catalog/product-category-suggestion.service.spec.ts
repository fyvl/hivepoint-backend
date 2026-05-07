import { AppConfigService } from '../../common/config/config.service';
import { ErrorCodes } from '../../common/errors/error.codes';
import { ProductCategorySuggestionService } from './product-category-suggestion.service';

describe('ProductCategorySuggestionService', () => {
    let service: ProductCategorySuggestionService;
    let fetchMock: jest.Mock;
    const originalFetch = global.fetch;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as typeof fetch;

        service = new ProductCategorySuggestionService({
            mlSuggestionsEnabled: true,
            mlServiceUrl: 'http://ml.example.com/',
            mlRequestTimeoutMs: 5_000,
        } as AppConfigService);
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('returns normalized category and tag suggestions from ml service', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                category: 'data_validation',
                categoryScore: 0.67,
                tags: [
                    { tag: 'email-validation', score: 0.8 },
                    { tag: 'email', score: 0.72 },
                ],
                method: 'embeddings',
                model: 'paraphrase-multilingual-MiniLM-L12-v2',
            }),
        });

        const result = await service.suggest({
            title: 'Email validation API',
            description:
                'Checks email domains, MX records, and disposable mailboxes.',
            topKTags: 2,
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'http://ml.example.com/classify',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Email validation API',
                    description:
                        'Checks email domains, MX records, and disposable mailboxes.',
                    topKTags: 2,
                }),
            }),
        );
        expect(result).toEqual({
            category: 'data_validation',
            categoryScore: 0.67,
            tags: [
                { tag: 'email-validation', score: 0.8 },
                { tag: 'email', score: 0.72 },
            ],
            method: 'embeddings',
            model: 'paraphrase-multilingual-MiniLM-L12-v2',
        });
    });

    it('uses topKTags default when caller does not pass it', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                category: 'payments',
                categoryScore: 0.7,
                tags: [{ tag: 'card', score: 0.6 }],
                method: 'embeddings',
                model: 'test-model',
            }),
        });

        await service.suggest({
            title: 'Payments API',
            description: 'Accept card payments and recurring subscriptions.',
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: expect.stringContaining('"topKTags":3'),
            }),
        );
    });

    it('fails when ml suggestions are disabled', async () => {
        service = new ProductCategorySuggestionService({
            mlSuggestionsEnabled: false,
        } as AppConfigService);

        await expect(
            service.suggest({
                title: 'Payments API',
                description: 'Accept card payments and recurring subscriptions.',
            }),
        ).rejects.toMatchObject({
            code: ErrorCodes.ML_SUGGESTIONS_DISABLED,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps provider failures to ml upstream error', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({
                detail: 'MODEL_UNAVAILABLE',
            }),
        });

        await expect(
            service.suggest({
                title: 'Email validation API',
                description:
                    'Checks email domains, MX records, and disposable mailboxes.',
            }),
        ).rejects.toMatchObject({
            code: ErrorCodes.ML_UPSTREAM_UNAVAILABLE,
        });
    });

    it('rejects malformed ml payloads', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                category: '',
                categoryScore: 0.1,
                tags: [],
            }),
        });

        await expect(
            service.suggest({
                title: 'Email validation API',
                description:
                    'Checks email domains, MX records, and disposable mailboxes.',
            }),
        ).rejects.toMatchObject({
            code: ErrorCodes.ML_UPSTREAM_UNAVAILABLE,
        });
    });
});
