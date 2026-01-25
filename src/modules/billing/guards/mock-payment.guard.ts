import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../../common/config/env.schema';
import { AppError } from '../../../common/errors/app.error';
import { ErrorCodes } from '../../../common/errors/error.codes';

@Injectable()
export class MockPaymentGuard implements CanActivate {
    constructor(private readonly configService: ConfigService<Env, true>) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const provided = request.headers['x-mock-payment-secret'];
        const secret = this.configService.getOrThrow('MOCK_PAYMENT_SECRET');

        const value = Array.isArray(provided) ? provided[0] : provided;
        if (!value || value !== secret) {
            throw new AppError({
                code: ErrorCodes.MOCK_PAYMENT_FORBIDDEN,
                message: 'MOCK_PAYMENT_FORBIDDEN',
                httpStatus: 403,
            });
        }

        return true;
    }
}
