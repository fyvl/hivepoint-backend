import { Role } from '@prisma/client';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

type PrismaMock = {
    subscription: {
        findUnique: jest.Mock;
        update: jest.Mock;
    };
};

describe('SubscriptionsService', () => {
    let service: SubscriptionsService;
    let prisma: PrismaMock;

    beforeEach(() => {
        prisma = {
            subscription: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
        };

        service = new SubscriptionsService(prisma as unknown as PrismaService);
    });

    it('user can cancel own subscription', async () => {
        prisma.subscription.findUnique.mockResolvedValue({
            id: 'sub-1',
            userId: 'user-1',
            cancelAtPeriodEnd: false,
        });
        prisma.subscription.update.mockResolvedValue({});

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        const result = await service.cancelSubscription('sub-1', user);

        expect(prisma.subscription.update).toHaveBeenCalledWith({
            where: { id: 'sub-1' },
            data: { cancelAtPeriodEnd: true },
        });
        expect(result.ok).toBe(true);
    });

    it('user cannot cancel another user subscription', async () => {
        prisma.subscription.findUnique.mockResolvedValue({
            id: 'sub-1',
            userId: 'user-2',
            cancelAtPeriodEnd: false,
        });

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        await expect(service.cancelSubscription('sub-1', user)).rejects.toMatchObject({
            code: ErrorCodes.NOT_OWNER,
        });
    });
});
