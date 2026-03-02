import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserMeResponseDto } from './dto/user-me.dto';

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

    async updateMyRole(userId: string, targetRole: Role): Promise<UserMeResponseDto> {
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
}
