import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { Request } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { AppConfigService } from '../../../common/config/config.service';
import type { AuthenticatedUser } from '../../../common/decorators/user.decorator';
import { AppError } from '../../../common/errors/app.error';
import { ErrorCodes } from '../../../common/errors/error.codes';

interface AccessTokenPayload extends JwtPayload {
    sub?: string;
    email?: string;
    role?: Role;
}

@Injectable()
export class OptionalJwtGuard implements CanActivate {
    constructor(private readonly configService: AppConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context
            .switchToHttp()
            .getRequest<Request & { user?: AuthenticatedUser }>();

        const authHeader = request.headers.authorization;
        if (!authHeader) {
            return true;
        }

        if (!authHeader.startsWith('Bearer ')) {
            throw new AppError({
                code: ErrorCodes.UNAUTHORIZED,
                message: 'UNAUTHORIZED',
                httpStatus: 401,
            });
        }

        const token = authHeader.replace('Bearer ', '').trim();
        if (!token) {
            throw new AppError({
                code: ErrorCodes.UNAUTHORIZED,
                message: 'UNAUTHORIZED',
                httpStatus: 401,
            });
        }

        let payload: AccessTokenPayload;
        try {
            const decoded = jwt.verify(token, this.configService.jwtAccessSecret);
            if (typeof decoded === 'string') {
                throw new Error('Invalid token payload');
            }
            payload = decoded as AccessTokenPayload;
        } catch {
            throw new AppError({
                code: ErrorCodes.UNAUTHORIZED,
                message: 'UNAUTHORIZED',
                httpStatus: 401,
            });
        }

        if (!payload.sub || !payload.email || !payload.role) {
            throw new AppError({
                code: ErrorCodes.UNAUTHORIZED,
                message: 'UNAUTHORIZED',
                httpStatus: 401,
            });
        }

        request.user = {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
        };

        return true;
    }
}
