import { Controller, Get } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { OpenApiService } from './openapi.service';

@Controller()
export class OpenApiController {
    constructor(private readonly openApiService: OpenApiService) {}

    @Get('openapi.json')
    getOpenApi(): OpenAPIObject {
        return this.openApiService.getDocument();
    }
}
