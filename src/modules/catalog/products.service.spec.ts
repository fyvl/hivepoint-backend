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

        await expect(service.getProductById('product-1')).rejects.toMatchObject({
            code: ErrorCodes.PRODUCT_NOT_PUBLIC,
        });
    });
});
