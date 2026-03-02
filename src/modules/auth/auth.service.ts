import { Injectable } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { randomUUID } from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { AppConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashPassword, hashToken, verifyPassword, verifyTokenHash } from '../../common/utils/crypto';
import {
    LoginInput,
    RegisterInput,
    RegisterParsedInput,
    loginSchema,
    registerSchema,
} from './auth.schemas';

interface AccessTokenPayload {
    sub: string;
    email: string;
    role: Role;
}

interface RefreshTokenPayload extends JwtPayload {
    rtid?: string;
    sub?: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export interface AuthUserResponse {
    id: string;
    email: string;
    role: Role;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: AppConfigService,
    ) {}

    async register(input: RegisterInput): Promise<AuthUserResponse> {
        const data = this.parseRegister(input);

        const existingUser = await this.prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw new AppError({
                code: ErrorCodes.CONFLICT,
                message: 'EMAIL_ALREADY_EXISTS',
                httpStatus: 409,
            });
        }

        const passwordHash = await hashPassword(data.password);

        const user = await this.prisma.user.create({
            data: {
                email: data.email,
                passwordHash,
                role: data.role,
            },
        });

        return {
            id: user.id,
            email: user.email,
            role: user.role,
        };
    }

    async login(input: LoginInput): Promise<AuthTokens> {
        const data = this.parseLogin(input);

        const user = await this.prisma.user.findUnique({
            where: { email: data.email },
        });

        if (!user) {
            throw this.buildUnauthorizedError('INVALID_CREDENTIALS');
        }

        const passwordValid = await verifyPassword(data.password, user.passwordHash);
        if (!passwordValid) {
            throw this.buildUnauthorizedError('INVALID_CREDENTIALS');
        }

        await this.prisma.refreshToken.deleteMany({
            where: { userId: user.id },
        });

        const { tokenId, token, expiresAt } = this.createRefreshToken(user);
        const tokenHash = await hashToken(token);

        await this.prisma.refreshToken.create({
            data: {
                id: tokenId,
                userId: user.id,
                tokenHash,
                expiresAt,
            },
        });

        return {
            accessToken: this.createAccessToken(user),
            refreshToken: token,
        };
    }

    async refresh(refreshToken: string): Promise<AuthTokens> {
        if (!refreshToken) {
            throw this.buildUnauthorizedError('UNAUTHORIZED');
        }

        const payload = this.verifyRefreshToken(refreshToken);
        if (!payload.rtid) {
            throw this.buildUnauthorizedError('UNAUTHORIZED');
        }

        const storedToken = await this.prisma.refreshToken.findUnique({
            where: { id: payload.rtid },
            include: { user: true },
        });

        if (!storedToken) {
            throw this.buildUnauthorizedError('UNAUTHORIZED');
        }

        if (storedToken.expiresAt.getTime() <= Date.now()) {
            await this.prisma.refreshToken.deleteMany({
                where: { id: storedToken.id },
            });
            throw this.buildUnauthorizedError('UNAUTHORIZED');
        }

        const matches = await verifyTokenHash(refreshToken, storedToken.tokenHash);
        if (!matches) {
            await this.prisma.refreshToken.deleteMany({
                where: { userId: storedToken.userId },
            });
            throw this.buildUnauthorizedError('UNAUTHORIZED');
        }

        await this.prisma.refreshToken.deleteMany({
            where: { userId: storedToken.userId },
        });

        const { tokenId, token, expiresAt } = this.createRefreshToken(storedToken.user);
        const tokenHash = await hashToken(token);

        await this.prisma.refreshToken.create({
            data: {
                id: tokenId,
                userId: storedToken.userId,
                tokenHash,
                expiresAt,
            },
        });

        return {
            accessToken: this.createAccessToken(storedToken.user),
            refreshToken: token,
        };
    }

    async logout(refreshToken?: string): Promise<void> {
        if (!refreshToken) {
            return;
        }

        try {
            const payload = this.verifyRefreshToken(refreshToken);
            if (!payload.rtid) {
                return;
            }

            await this.prisma.refreshToken.deleteMany({
                where: { id: payload.rtid },
            });
        } catch {
            return;
        }
    }

    private createAccessToken(user: User): string {
        const payload: AccessTokenPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
        };

        return jwt.sign(payload, this.configService.jwtAccessSecret, {
            expiresIn: this.configService.jwtAccessTtlSeconds,
        });
    }

    private createRefreshToken(user: User): { tokenId: string; token: string; expiresAt: Date } {
        const tokenId = randomUUID();
        const expiresAt = new Date(Date.now() + this.configService.jwtRefreshTtlSeconds * 1000);

        const token = jwt.sign(
            {
                rtid: tokenId,
                sub: user.id,
            },
            this.configService.jwtRefreshSecret,
            {
                expiresIn: this.configService.jwtRefreshTtlSeconds,
            },
        );

        return { tokenId, token, expiresAt };
    }

    private verifyRefreshToken(token: string): RefreshTokenPayload {
        try {
            const decoded = jwt.verify(token, this.configService.jwtRefreshSecret);
            if (typeof decoded === 'string') {
                throw new Error('Invalid token payload');
            }

            return decoded as RefreshTokenPayload;
        } catch {
            throw this.buildUnauthorizedError('UNAUTHORIZED');
        }
    }

    private parseRegister(input: RegisterInput): RegisterParsedInput {
        const result = registerSchema.safeParse(input);
        if (!result.success) {
            throw new AppError({
                code: ErrorCodes.VALIDATION_ERROR,
                message: 'VALIDATION_ERROR',
                httpStatus: 400,
                details: result.error.flatten(),
            });
        }

        return result.data;
    }

    private parseLogin(input: LoginInput): LoginInput {
        const result = loginSchema.safeParse(input);
        if (!result.success) {
            throw new AppError({
                code: ErrorCodes.VALIDATION_ERROR,
                message: 'VALIDATION_ERROR',
                httpStatus: 400,
                details: result.error.flatten(),
            });
        }

        return result.data;
    }

    private buildUnauthorizedError(message: string): AppError {
        return new AppError({
            code: ErrorCodes.UNAUTHORIZED,
            message,
            httpStatus: 401,
        });
    }
}
