import { Injectable } from '@nestjs/common';
import { ProductStatus, Role, SubscriptionStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashPassword, verifyPassword } from '../../common/utils/crypto';
import { UserMeResponseDto } from './dto/user-me.dto';
import { UserProfileSummaryDto } from './dto/profile-summary.dto';
import type { ChangePasswordInput } from './users.schemas';

const userMeSelect = {
    id: true,
    email: true,
    role: true,
} as const;

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    async getMe(userId: string): Promise<UserMeResponseDto> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: userMeSelect,
        });

        if (!user) {
            throw new AppError({
                code: ErrorCodes.NOT_FOUND,
                message: 'USER_NOT_FOUND',
                httpStatus: 404,
            });
        }

        return user;
    }

    async updateMyRole(
        userId: string,
        targetRole: Role,
    ): Promise<UserMeResponseDto> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: userMeSelect,
        });

        if (!user) {
            throw new AppError({
                code: ErrorCodes.NOT_FOUND,
                message: 'USER_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (targetRole !== Role.SELLER) {
            throw new AppError({
                code: ErrorCodes.FORBIDDEN_ROLE,
                message: 'FORBIDDEN_ROLE',
                httpStatus: 403,
            });
        }

        if (user.role === Role.SELLER) {
            return user;
        }

        if (user.role !== Role.BUYER) {
            throw new AppError({
                code: ErrorCodes.FORBIDDEN_ROLE,
                message: 'FORBIDDEN_ROLE',
                httpStatus: 403,
            });
        }

        return this.prisma.user.update({
            where: { id: userId },
            data: {
                role: Role.SELLER,
            },
            select: userMeSelect,
        });
    }

    async getProfileSummary(userId: string): Promise<UserProfileSummaryDto> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
            },
        });

        if (!user) {
            throw new AppError({
                code: ErrorCodes.NOT_FOUND,
                message: 'USER_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const canUpgradeToSeller = user.role === Role.BUYER;
        const shouldCountProducts =
            user.role === Role.SELLER || user.role === Role.ADMIN;

        const [
            subscriptionsTotal,
            subscriptionsActive,
            apiKeysActive,
            productsTotal,
            productsPublished,
        ] = await Promise.all([
            this.prisma.subscription.count({
                where: { userId: user.id },
            }),
            this.prisma.subscription.count({
                where: {
                    userId: user.id,
                    status: SubscriptionStatus.ACTIVE,
                },
            }),
            this.prisma.apiKey.count({
                where: {
                    userId: user.id,
                    isActive: true,
                },
            }),
            shouldCountProducts
                ? this.prisma.apiProduct.count({
                      where: { ownerId: user.id },
                  })
                : Promise.resolve(0),
            shouldCountProducts
                ? this.prisma.apiProduct.count({
                      where: {
                          ownerId: user.id,
                          status: ProductStatus.PUBLISHED,
                      },
                  })
                : Promise.resolve(0),
        ]);

        return {
            subscriptionsTotal,
            subscriptionsActive,
            apiKeysActive,
            productsTotal,
            productsPublished,
            canUpgradeToSeller,
        };
    }

    async changePassword(
        userId: string,
        input: ChangePasswordInput,
    ): Promise<{ ok: true }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                passwordHash: true,
            },
        });

        if (!user) {
            throw new AppError({
                code: ErrorCodes.NOT_FOUND,
                message: 'USER_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const matches = await verifyPassword(
            input.currentPassword,
            user.passwordHash,
        );
        if (!matches) {
            throw new AppError({
                code: ErrorCodes.UNAUTHORIZED,
                message: 'INVALID_CURRENT_PASSWORD',
                httpStatus: 401,
            });
        }

        const nextPasswordHash = await hashPassword(input.newPassword);

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: userId },
                data: { passwordHash: nextPasswordHash },
            }),
            this.prisma.refreshToken.deleteMany({
                where: { userId },
            }),
        ]);

        return { ok: true };
    }
}
