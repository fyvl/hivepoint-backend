import { ProductStatus, Role } from '@prisma/client';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProductsService } from './products.service';

type PrismaMock = {
    apiProduct: {
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
    };
    productView: {
        create: jest.Mock;
    };
};

describe('ProductsService', () => {
    let service: ProductsService;
    let prisma: PrismaMock;

    beforeEach(() => {
        prisma = {
            apiProduct: {
                findMany: jest.fn(),
                count: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            productView: {
                create: jest.fn(),
            },
        };

        service = new ProductsService(prisma as unknown as PrismaService);
    });

    it('lists only published products', async () => {
        prisma.apiProduct.findMany.mockResolvedValue([]);
        prisma.apiProduct.count.mockResolvedValue(0);

        await service.listPublicProducts({ limit: 20, offset: 0 });

        expect(prisma.apiProduct.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    status: ProductStatus.PUBLISHED,
                }),
            }),
        );
        expect(prisma.apiProduct.count).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    status: ProductStatus.PUBLISHED,
                }),
            }),
        );
    });

    it('filters products by category and tag', async () => {
        prisma.apiProduct.findMany.mockResolvedValue([]);
        prisma.apiProduct.count.mockResolvedValue(0);

        await service.listPublicProducts({
            category: 'payments',
            tag: 'openapi',
            limit: 20,
            offset: 0,
        });

        expect(prisma.apiProduct.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    category: 'payments',
                    tags: {
                        has: 'openapi',
                    },
                }),
            }),
        );
        expect(prisma.apiProduct.count).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    category: 'payments',
                    tags: {
                        has: 'openapi',
                    },
                }),
            }),
        );
    });

    it('searches public products across metadata and tags', async () => {
        prisma.apiProduct.findMany.mockResolvedValue([]);
        prisma.apiProduct.count.mockResolvedValue(0);

        await service.listPublicProducts({
            search: 'openapi',
            limit: 20,
            offset: 0,
        });

        expect(prisma.apiProduct.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    OR: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.objectContaining({
                                contains: 'openapi',
                            }),
                        }),
                        expect.objectContaining({
                            description: expect.objectContaining({
                                contains: 'openapi',
                            }),
                        }),
                        expect.objectContaining({
                            category: expect.objectContaining({
                                contains: 'openapi',
                            }),
                        }),
                        {
                            tags: {
                                has: 'openapi',
                            },
                        },
                    ]),
                }),
            }),
        );
    });

    it('non-owner cannot update product', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'product-1',
            ownerId: 'owner-1',
            status: ProductStatus.DRAFT,
        });

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.SELLER,
        };

        await expect(
            service.updateProduct('product-1', { title: 'New title' }, user),
        ).rejects.toMatchObject({
            code: ErrorCodes.NOT_OWNER,
        });
    });

    it('public cannot fetch draft product', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'product-1',
            ownerId: 'owner-1',
            title: 'Title',
            description: 'Long enough description',
            category: 'payments',
            tags: [],
            status: ProductStatus.DRAFT,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await expect(service.getProductById('product-1')).rejects.toMatchObject(
            {
                code: ErrorCodes.PRODUCT_NOT_PUBLIC,
            },
        );
    });

    it('records a public view when published product is fetched', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'product-1',
            ownerId: 'owner-1',
            title: 'Title',
            description: 'Long enough description',
            category: 'payments',
            tags: [],
            status: ProductStatus.PUBLISHED,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await service.getProductById('product-1');

        expect(prisma.productView.create).toHaveBeenCalledWith({
            data: {
                productId: 'product-1',
                viewerUserId: null,
            },
        });
    });
});
