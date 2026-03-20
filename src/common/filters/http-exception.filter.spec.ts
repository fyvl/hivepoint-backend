import { HttpStatus } from '@nestjs/common';
import { AppError } from '../errors/app.error';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
    it('includes request id in the error response when present', () => {
        const filter = new HttpExceptionFilter();
        const status = jest.fn().mockReturnThis();
        const json = jest.fn();

        filter.catch(
            new AppError({
                code: 'TEST_ERROR',
                message: 'TEST_ERROR',
                httpStatus: HttpStatus.BAD_REQUEST,
            }),
            {
                switchToHttp: () => ({
                    getRequest: () => ({
                        requestId: 'req-1',
                    }),
                    getResponse: () => ({
                        status,
                        json,
                    }),
                }),
            } as never,
        );

        expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
        expect(json).toHaveBeenCalledWith({
            error: {
                code: 'TEST_ERROR',
                message: 'TEST_ERROR',
                details: undefined,
                requestId: 'req-1',
            },
        });
    });
});
