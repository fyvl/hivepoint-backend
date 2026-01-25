import { ProductStatus, VersionStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminService } from './admin.service';

type PrismaMock = {
    apiProduct: {
        findUnique: jest.Mock;
        update: jest.Mock;
    };
    apiVersion: {
        findUnique: jest.Mock;
        update: jest.Mock;
    };
    apiKey: {
        findUnique: jest.Mock;
        update: jest.Mock;
    };
};

describe('AdminService', () => {
    let service: AdminService;
    let prisma: PrismaMock;

    beforeEach(() => {
        prisma = {
            apiProduct: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            apiVersion: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            apiKey: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
        };

        service = new AdminService(prisma as unknown as PrismaService);
    });

    it('hide product sets status to hidden', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'prod-1',
            status: ProductStatus.PUBLISHED,
        });

        const result = await service.hideProduct('prod-1');

        expect(prisma.apiProduct.update).toHaveBeenCalledWith({
            where: { id: 'prod-1' },
            data: { status: ProductStatus.HIDDEN },
        });
        expect(result).toEqual({ ok: true, productId: 'prod-1' });
    });

    it('hide version sets status to draft', async () => {
        prisma.apiVersion.findUnique.mockResolvedValue({
            id: 'ver-1',
            status: VersionStatus.PUBLISHED,
        });

        const result = await service.hideVersion('ver-1');

        expect(prisma.apiVersion.update).toHaveBeenCalledWith({
            where: { id: 'ver-1' },
            data: { status: VersionStatus.DRAFT },
        });
        expect(result).toEqual({ ok: true, versionId: 'ver-1' });
    });

    it('revoke key sets inactive', async () => {
        prisma.apiKey.findUnique.mockResolvedValue({
            id: 'key-1',
            isActive: true,
            revokedAt: null,
        });

        const result = await service.revokeKey('key-1');

        expect(prisma.apiKey.update).toHaveBeenCalledWith({
            where: { id: 'key-1' },
            data: {
                isActive: false,
                revokedAt: expect.any(Date),
            },
        });
        expect(result).toEqual({ ok: true, keyId: 'key-1' });
    });
});
