import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../decorators/user.decorator';
import { AppError } from '../errors/app.error';
import { ErrorCodes } from '../errors/error.codes';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]) ?? [];

        if (requiredRoles.length === 0) {
            return true;
        }

        const request = context
            .switchToHttp()
            .getRequest<Request & { user?: AuthenticatedUser }>();
        const user = request.user;

        if (!user) {
            throw new AppError({
                code: ErrorCodes.UNAUTHORIZED,
                message: 'UNAUTHORIZED',
                httpStatus: 401,
            });
        }

        if (!requiredRoles.includes(user.role)) {
            throw new AppError({
                code: ErrorCodes.FORBIDDEN,
                message: 'FORBIDDEN',
                httpStatus: 403,
            });
        }

        return true;
    }
}
