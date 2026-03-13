import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../common/config/env.schema';
import { ErrorCodes } from '../../../common/errors/error.codes';
import { MockPaymentGuard } from './mock-payment.guard';

const buildContext = (
    headers: Record<string, string | string[] | undefined>,
): ExecutionContext =>
    ({
        switchToHttp: () => ({
            getRequest: () => ({ headers }),
        }),
    }) as ExecutionContext;

describe('MockPaymentGuard', () => {
    it('rejects when header is missing', () => {
        expect.assertions(1);
        const configService = {
            getOrThrow: jest.fn().mockReturnValue('secret'),
        } as unknown as ConfigService<Env, true>;

        const guard = new MockPaymentGuard(configService);

        try {
            guard.canActivate(buildContext({}));
        } catch (error) {
            expect(error).toMatchObject({
                code: ErrorCodes.MOCK_PAYMENT_FORBIDDEN,
            });
        }
    });

    it('rejects when header is wrong', () => {
        expect.assertions(1);
        const configService = {
            getOrThrow: jest.fn().mockReturnValue('secret'),
        } as unknown as ConfigService<Env, true>;

        const guard = new MockPaymentGuard(configService);

        try {
            guard.canActivate(
                buildContext({ 'x-mock-payment-secret': 'wrong' }),
            );
        } catch (error) {
            expect(error).toMatchObject({
                code: ErrorCodes.MOCK_PAYMENT_FORBIDDEN,
            });
        }
    });
});
