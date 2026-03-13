import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { OpenApiService } from '../../common/openapi/openapi.service';

@Injectable()
export class SwaggerAuthDocumentUpdater implements OnApplicationBootstrap {
    constructor(private readonly openApiService: OpenApiService) {}

    onApplicationBootstrap(): void {
        const document = this.openApiService.getDocument();
        document.components = document.components ?? {};
        document.components.securitySchemes =
            document.components.securitySchemes ?? {};
        document.components.securitySchemes.bearer = {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
        };
    }
}
