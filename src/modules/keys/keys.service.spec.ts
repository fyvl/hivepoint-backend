import { createHash } from 'crypto';
import { Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env.schema';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as cryptoUtils from '../../common/utils/crypto';
import { KeysService } from './keys.service';

type PrismaMock = {
    apiKey: {
        create: jest.Mock;
        findMany: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
    };
};

describe('KeysService', () => {
    let service: KeysService;
    let prisma: PrismaMock;
    let configService: ConfigService<Env, true>;

    beforeEach(() => {
        prisma = {
            apiKey: {
                create: jest.fn(),
                findMany: jest.fn(),
                findUnique: jest.fn(),
                update: jest.fn(),
            },
        };

        configService = {
            getOrThrow: jest.fn().mockReturnValue('salt'),
        } as unknown as ConfigService<Env, true>;

        service = new KeysService(prisma as unknown as PrismaService, configService);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('createKey returns rawKey and stores hash', async () => {
        const rawKey = 'hp_test_key';
        const rawKeySpy = jest.spyOn(cryptoUtils, 'generateRawApiKey').mockReturnValue(rawKey);
        const createdAt = new Date('2026-01-01T00:00:00.000Z');

        prisma.apiKey.create.mockResolvedValue({
            id: 'key-1',
            label: 'My key',
            createdAt,
        });

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        const result = await service.createKey({ label: 'My key' }, user);

        const expectedHash = createHash('sha256').update(rawKey + 'salt').digest('hex');

        expect(rawKeySpy).toHaveBeenCalled();
        expect(prisma.apiKey.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: 'user-1',
                    label: 'My key',
                    keyHash: expectedHash,
                    isActive: true,
                    revokedAt: null,
                }),
            }),
        );
        expect(result).toEqual({
            id: 'key-1',
            label: 'My key',
            rawKey,
            createdAt,
        });
    });

    it('listKeys does not expose keyHash', async () => {
        prisma.apiKey.findMany.mockResolvedValue([
            {
                id: 'key-1',
                label: 'Key',
                isActive: true,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                revokedAt: null,
            },
        ]);

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        const result = await service.listKeys(user);

        expect(result.items[0]).not.toHaveProperty('keyHash');
    });

    it('owner can revoke key', async () => {
        prisma.apiKey.findUnique.mockResolvedValue({
            id: 'key-1',
            userId: 'user-1',
            isActive: true,
            revokedAt: null,
        });

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        const result = await service.revokeKey('key-1', user);

        expect(prisma.apiKey.update).toHaveBeenCalledWith({
            where: { id: 'key-1' },
            data: {
                isActive: false,
                revokedAt: expect.any(Date),
            },
        });
        expect(result).toEqual({ ok: true, keyId: 'key-1' });
    });

    it('non-owner cannot revoke key', async () => {
        prisma.apiKey.findUnique.mockResolvedValue({
            id: 'key-1',
            userId: 'user-2',
            isActive: true,
            revokedAt: null,
        });

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        await expect(service.revokeKey('key-1', user)).rejects.toMatchObject({
            code: ErrorCodes.NOT_OWNER,
        });
    });

    it('revoke is idempotent for already revoked keys', async () => {
        prisma.apiKey.findUnique.mockResolvedValue({
            id: 'key-1',
            userId: 'user-1',
            isActive: false,
            revokedAt: new Date('2026-01-01T00:00:00.000Z'),
        });

        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: Role.BUYER,
        };

        const result = await service.revokeKey('key-1', user);

        expect(prisma.apiKey.update).not.toHaveBeenCalled();
        expect(result).toEqual({ ok: true, keyId: 'key-1' });
    });
});
