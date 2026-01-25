import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserMeResponseDto } from './dto/user-me.dto';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    async getMe(userId: string): Promise<UserMeResponseDto> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
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

        return user;
    }
}
