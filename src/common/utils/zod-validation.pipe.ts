import { PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';
import { AppError } from '../errors/app.error';
import { ErrorCodes } from '../errors/error.codes';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
    constructor(private readonly schema: ZodSchema<T>) {}

    transform(value: unknown): T {
        const result = this.schema.safeParse(value);

        if (!result.success) {
            throw new AppError({
                code: ErrorCodes.VALIDATION_ERROR,
                message: 'VALIDATION_ERROR',
                httpStatus: 400,
                details: this.formatZodIssues(result.error),
            });
        }

        return result.data;
    }

    private formatZodIssues(error: ZodError): Array<{ path: string; message: string }> {
        return error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
        }));
    }
}
