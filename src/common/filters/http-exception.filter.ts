import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { AppError } from '../errors/app.error';
import { ErrorCodes } from '../errors/error.codes';

interface ErrorResponse {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        let status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        let code: string = ErrorCodes.INTERNAL_ERROR;
        let message = 'Internal server error';
        let details: unknown;

        if (exception instanceof AppError) {
            status = exception.httpStatus;
            code = exception.code;
            message = exception.message;
            details = exception.details;
        } else if (exception instanceof HttpException) {
            status = exception.getStatus() as HttpStatus;
            code = this.mapHttpStatusToCode(status);

            const responseBody = exception.getResponse();
            if (typeof responseBody === 'string') {
                message = responseBody;
            } else if (
                typeof responseBody === 'object' &&
                responseBody !== null
            ) {
                const payload = responseBody as {
                    message?: string | string[];
                    code?: string;
                    error?: string;
                };

                if (payload.code) {
                    code = payload.code;
                }

                if (Array.isArray(payload.message)) {
                    message = payload.message.join('; ');
                } else if (typeof payload.message === 'string') {
                    message = payload.message;
                } else if (typeof payload.error === 'string') {
                    message = payload.error;
                } else {
                    message = exception.message;
                }

                details = responseBody;
            } else {
                message = exception.message;
            }
        }

        const body: ErrorResponse = {
            error: {
                code,
                message,
                details,
            },
        };

        response.status(status).json(body);
    }

    private mapHttpStatusToCode(status: HttpStatus): string {
        switch (status) {
            case HttpStatus.BAD_REQUEST:
                return ErrorCodes.BAD_REQUEST;
            case HttpStatus.UNAUTHORIZED:
                return ErrorCodes.UNAUTHORIZED;
            case HttpStatus.FORBIDDEN:
                return ErrorCodes.FORBIDDEN;
            case HttpStatus.NOT_FOUND:
                return ErrorCodes.NOT_FOUND;
            case HttpStatus.CONFLICT:
                return ErrorCodes.CONFLICT;
            case HttpStatus.UNPROCESSABLE_ENTITY:
                return ErrorCodes.VALIDATION_ERROR;
            default:
                return Number(status) >= 500
                    ? ErrorCodes.INTERNAL_ERROR
                    : ErrorCodes.HTTP_ERROR;
        }
    }
}
