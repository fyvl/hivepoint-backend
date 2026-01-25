import { PlanPeriod, Role } from '@prisma/client';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlansService } from './plans.service';

type PrismaMock = {
    apiProduct: {
        findUnique: jest.Mock;
    };
    plan: {
        findMany: jest.Mock;
        create: jest.Mock;
    };
};

describe('PlansService', () => {
    let service: PlansService;
    let prisma: PrismaMock;

    beforeEach(() => {
        prisma = {
            apiProduct: {
                findUnique: jest.fn(),
            },
            plan: {
                findMany: jest.fn(),
                create: jest.fn(),
            },
        };

        service = new PlansService(prisma as unknown as PrismaService);
    });

    it('seller can create plan for own product', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'product-1',
            ownerId: 'seller-1',
        });
        prisma.plan.create.mockResolvedValue({
            id: 'plan-1',
            productId: 'product-1',
            name: 'Starter',
            priceCents: 1000,
            currency: 'EUR',
            period: PlanPeriod.MONTH,
            quotaRequests: 10000,
            isActive: true,
            createdAt: new Date(),
        });

        const user = {
            id: 'seller-1',
            email: 'seller@example.com',
            role: Role.SELLER,
        };

        const result = await service.createPlan(
            {
                productId: 'product-1',
                name: 'Starter',
                priceCents: 1000,
                quotaRequests: 10000,
            },
            user,
        );

        expect(prisma.plan.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    productId: 'product-1',
                    isActive: true,
                    period: PlanPeriod.MONTH,
                }),
            }),
        );
        expect(result.id).toBe('plan-1');
    });

    it('seller cannot create plan for another product owner', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({
            id: 'product-1',
            ownerId: 'owner-1',
        });

        const user = {
            id: 'seller-1',
            email: 'seller@example.com',
            role: Role.SELLER,
        };

        await expect(
            service.createPlan(
                {
                    productId: 'product-1',
                    name: 'Starter',
                    priceCents: 1000,
                    quotaRequests: 10000,
                },
                user,
            ),
        ).rejects.toMatchObject({
            code: ErrorCodes.NOT_OWNER,
        });
    });

    it('get plans returns only active plans', async () => {
        prisma.apiProduct.findUnique.mockResolvedValue({ id: 'product-1' });
        prisma.plan.findMany.mockResolvedValue([]);

        await service.listActivePlans('product-1');

        expect(prisma.plan.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    productId: 'product-1',
                    isActive: true,
                },
            }),
        );
    });
});
