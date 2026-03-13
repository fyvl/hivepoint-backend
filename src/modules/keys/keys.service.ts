import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import type { Env } from '../../common/config/env.schema';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { generateRawApiKey, hashApiKey } from '../../common/utils/crypto';
import type { CreateKeyInput } from './keys.schemas';
import { CreateKeyResponseDto } from './dto/create-key-response.dto';
import { ListKeysResponseDto } from './dto/list-keys-response.dto';
import { RevokeKeyResponseDto } from './dto/revoke-key-response.dto';

@Injectable()
export class KeysService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService<Env, true>,
    ) {}

    async createKey(
        input: CreateKeyInput,
        user: AuthenticatedUser,
    ): Promise<CreateKeyResponseDto> {
        const rawKey = generateRawApiKey();
        const salt = this.configService.getOrThrow<string>('API_KEY_SALT');
        const keyHash = hashApiKey(rawKey, salt);

        const apiKey = await this.prisma.apiKey.create({
            data: {
                userId: user.id,
                label: input.label,
                keyHash,
                isActive: true,
                revokedAt: null,
            },
            select: {
                id: true,
                label: true,
                createdAt: true,
            },
        });

        return {
            id: apiKey.id,
            label: apiKey.label,
            rawKey,
            createdAt: apiKey.createdAt,
        };
    }

    async listKeys(user: AuthenticatedUser): Promise<ListKeysResponseDto> {
        const items = await this.prisma.apiKey.findMany({
            where: { userId: user.id },
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                label: true,
                isActive: true,
                createdAt: true,
                revokedAt: true,
            },
        });

        return { items };
    }

    async revokeKey(
        keyId: string,
        user: AuthenticatedUser,
    ): Promise<RevokeKeyResponseDto> {
        const apiKey = await this.prisma.apiKey.findUnique({
            where: { id: keyId },
            select: {
                id: true,
                userId: true,
                isActive: true,
                revokedAt: true,
            },
        });

        if (!apiKey) {
            throw new AppError({
                code: ErrorCodes.KEY_NOT_FOUND,
                message: 'KEY_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (user.role !== Role.ADMIN && apiKey.userId !== user.id) {
            throw new AppError({
                code: ErrorCodes.NOT_OWNER,
                message: 'NOT_OWNER',
                httpStatus: 403,
            });
        }

        if (!apiKey.isActive || apiKey.revokedAt) {
            return { ok: true, keyId: apiKey.id };
        }

        await this.prisma.apiKey.update({
            where: { id: keyId },
            data: {
                isActive: false,
                revokedAt: new Date(),
            },
        });

        return { ok: true, keyId: apiKey.id };
    }
}
