import { Injectable } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { AppError } from '../errors/app.error';
import { ErrorCodes } from '../errors/error.codes';

@Injectable()
export class OpenApiService {
    private document: OpenAPIObject | null = null;

    setDocument(document: OpenAPIObject): void {
        this.document = document;
    }

    getDocument(): OpenAPIObject {
        if (!this.document) {
            throw new AppError({
                code: ErrorCodes.INTERNAL_ERROR,
                message: 'OpenAPI document is not initialized',
                httpStatus: 500,
            });
        }

        return this.document;
    }
}
