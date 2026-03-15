import { ProductStatus, Role, VersionStatus } from '@prisma/client';
import { AppConfigService } from '../../common/config/config.service';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VersionsService } from './versions.service';

type PrismaMock = {
    apiProduct: {
        findUnique: jest.Mock;
    };
    apiVersion: {
        findFirst: jest.Mock;
        create: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
    };
};

describe('VersionsService', () => {
    let service: VersionsService;
    let prisma: PrismaMock;
    let configService: AppConfigService;
    let fetchMock: jest.Mock;
    const originalFetch = global.fetch;

    beforeEach(() => {
        prisma = {
            apiProduct: {
                findUnique: jest.fn(),
            },
            apiVersion: {
                findFirst: jest.fn(),
                create: jest.fn(),
                findUnique: jest.fn(),
                update: jest.fn(),
            },
        };

        fetchMock = jest.fn();
        global.fetch = fetchMock as typeof fetch;

        configService = {
            allowPrivateNetworkTargets: true,
        } as AppConfigService;

        service = new VersionsService(
            prisma as unknown as PrismaService,
            configService,
        );
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('owner can create version', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'product-1',
            ownerId: 'owner-1',
            status: ProductStatus.DRAFT,
        });
        prisma.apiVersion.findFirst.mockResolvedValue(null);
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => '{"openapi":"3.0.0"}',
        });
        prisma.apiVersion.create.mockResolvedValue({
            id: 'version-1',
            productId: 'product-1',
            version: 'v1',
            status: VersionStatus.DRAFT,
            openApiUrl: 'https://example.com/openapi.json',
            createdAt: new Date(),
        });

        const user = {
            id: 'owner-1',
            email: 'owner@example.com',
            role: Role.SELLER,
        };

        const result = await service.createVersion(
            'product-1',
            { version: 'v1', openApiUrl: 'https://example.com/openapi.json' },
            user,
        );

        expect(prisma.apiVersion.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    productId: 'product-1',
                    status: VersionStatus.DRAFT,
                    openApiSnapshot: expect.any(String),
                    openApiFetchedAt: expect.any(Date),
                }),
            }),
        );
        expect(result.version).toBe('v1');
    });

    it('duplicate version throws VERSION_ALREADY_EXISTS', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'product-1',
            ownerId: 'owner-1',
            status: ProductStatus.DRAFT,
        });
        prisma.apiVersion.findFirst.mockResolvedValue({ id: 'existing' });

        const user = {
            id: 'owner-1',
            email: 'owner@example.com',
            role: Role.SELLER,
        };

        await expect(
            service.createVersion(
                'product-1',
                {
                    version: 'v1',
                    openApiUrl: 'https://example.com/openapi.json',
                },
                user,
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.VERSION_ALREADY_EXISTS,
        });
    });

    it('create version fails when openapi fetch fails', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'product-1',
            ownerId: 'owner-1',
            status: ProductStatus.DRAFT,
        });
        prisma.apiVersion.findFirst.mockResolvedValue(null);
        fetchMock.mockResolvedValue({
            ok: false,
            status: 404,
            text: async () => '',
        });

        const user = {
            id: 'owner-1',
            email: 'owner@example.com',
            role: Role.SELLER,
        };

        await expect(
            service.createVersion(
                'product-1',
                {
                    version: 'v1',
                    openApiUrl: 'https://example.com/openapi.json',
                },
                user,
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'OPENAPI_FETCH_FAILED',
        });

        expect(prisma.apiVersion.create).not.toHaveBeenCalled();
    });

    it('public can read stored schema for published version', async () => {
        prisma.apiVersion.findUnique.mockResolvedValue({
            id: 'version-1',
            productId: 'product-1',
            version: 'v1',
            status: VersionStatus.PUBLISHED,
            openApiUrl: 'https://example.com/openapi.json',
            openApiSnapshot: '{"openapi":"3.0.0"}',
            openApiFetchedAt: new Date('2026-03-02T00:00:00.000Z'),
            product: {
                ownerId: 'owner-1',
                status: ProductStatus.PUBLISHED,
            },
        });

        const result = await service.getVersionSchema('version-1');

        expect(result).toEqual(
            expect.objectContaining({
                versionId: 'version-1',
                productId: 'product-1',
                version: 'v1',
                openApiUrl: 'https://example.com/openapi.json',
                schema: '{"openapi":"3.0.0"}',
            }),
        );
    });
});
