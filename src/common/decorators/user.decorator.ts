import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';

export interface AuthenticatedUser {
    id: string;
    email: string;
    role: Role;
}

export const User = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
        const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
        return request.user;
    },
);
