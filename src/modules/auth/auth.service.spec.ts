import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { AppConfigService } from '../../common/config/config.service';
import {
    hashPassword,
    hashToken,
    verifyPassword,
} from '../../common/utils/crypto';
import { AuthService } from './auth.service';

const createConfigService = (): AppConfigService =>
    ({
        jwtAccessSecret: 'access-secret',
        jwtRefreshSecret: 'refresh-secret',
        jwtAccessTtlSeconds: 900,
        jwtRefreshTtlSeconds: 3600,
    }) as AppConfigService;

const createPrismaMock = () => ({
    user: {
        findUnique: jest.fn(),
        create: jest.fn(),
    },
    refreshToken: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
    },
});

describe('AuthService', () => {
    it('register creates user and hashes password', async () => {
        const prisma = createPrismaMock();
        const configService = createConfigService();
        const service = new AuthService(prisma as any, configService);

        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockImplementation(async ({ data }) => ({
            id: 'user-id',
            email: data.email,
            role: Role.BUYER,
            passwordHash: data.passwordHash,
        }));

        const result = await service.register({
            email: 'User@Example.com',
            password: 'password123',
        });

        expect(result).toEqual({
            id: 'user-id',
            email: 'user@example.com',
            role: Role.BUYER,
        });

        const createArgs = prisma.user.create.mock.calls[0][0];
        expect(createArgs.data.role).toBe(Role.BUYER);
        expect(createArgs.data.passwordHash).not.toBe('password123');
        await expect(
            verifyPassword('password123', createArgs.data.passwordHash),
        ).resolves.toBe(true);
    });

    it('register supports SELLER role selection', async () => {
        const prisma = createPrismaMock();
        const configService = createConfigService();
        const service = new AuthService(prisma as any, configService);

        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockImplementation(async ({ data }) => ({
            id: 'seller-id',
            email: data.email,
            role: data.role,
            passwordHash: data.passwordHash,
        }));

        const result = await service.register({
            email: 'seller@example.com',
            password: 'password123',
            role: Role.SELLER,
        });

        expect(result).toEqual({
            id: 'seller-id',
            email: 'seller@example.com',
            role: Role.SELLER,
        });

        const createArgs = prisma.user.create.mock.calls[0][0];
        expect(createArgs.data.role).toBe(Role.SELLER);
    });

    it('login returns access token and refresh token', async () => {
        const prisma = createPrismaMock();
        const configService = createConfigService();
        const service = new AuthService(prisma as any, configService);

        const passwordHash = await hashPassword('password123');
        prisma.user.findUnique.mockResolvedValue({
            id: 'user-id',
            email: 'user@example.com',
            role: Role.BUYER,
            passwordHash,
        });
        prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
        prisma.refreshToken.create.mockResolvedValue({ id: 'rtid' });

        const result = await service.login({
            email: 'USER@EXAMPLE.COM',
            password: 'password123',
        });

        expect(result.accessToken).toBeTruthy();
        expect(result.refreshToken).toBeTruthy();
        expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
            where: { userId: 'user-id' },
        });

        const createArgs = prisma.refreshToken.create.mock.calls[0][0];
        expect(createArgs.data.tokenHash).not.toBe(result.refreshToken);
    });

    it('refresh rotates refresh token and returns new access token', async () => {
        const prisma = createPrismaMock();
        const configService = createConfigService();
        const service = new AuthService(prisma as any, configService);

        const refreshTokenId = 'refresh-id';
        const user = {
            id: 'user-id',
            email: 'user@example.com',
            role: Role.BUYER,
        };
        const refreshToken = jwt.sign(
            { rtid: refreshTokenId, sub: user.id },
            configService.jwtRefreshSecret,
            { expiresIn: configService.jwtRefreshTtlSeconds },
        );
        const tokenHash = await hashToken(refreshToken);

        prisma.refreshToken.findUnique.mockResolvedValue({
            id: refreshTokenId,
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 10000),
            user,
        });
        prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
        prisma.refreshToken.create.mockResolvedValue({ id: 'new-refresh-id' });

        const result = await service.refresh(refreshToken);

        expect(result.accessToken).toBeTruthy();
        expect(result.refreshToken).toBeTruthy();
        expect(result.refreshToken).not.toBe(refreshToken);
        expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
            where: { userId: user.id },
        });
    });
});
