import { ProductStatus, Role, VersionStatus } from '@prisma/client';
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
    };
};

describe('VersionsService', () => {
    let service: VersionsService;
    let prisma: PrismaMock;

    beforeEach(() => {
        prisma = {
            apiProduct: {
                findUnique: jest.fn(),
            },
            apiVersion: {
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };

        service = new VersionsService(prisma as unknown as PrismaService);
    });

    it('owner can create version', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'product-1',
            ownerId: 'owner-1',
            status: ProductStatus.DRAFT,
        });
        prisma.apiVersion.findFirst.mockResolvedValue(null);
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
                { version: 'v1', openApiUrl: 'https://example.com/openapi.json' },
                user,
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.VERSION_ALREADY_EXISTS,
        });
    });
});
