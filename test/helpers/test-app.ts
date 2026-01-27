import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { OpenApiService } from '../../src/common/openapi/openapi.service';

export const createTestApp = async (): Promise<INestApplication> => {
    const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());

    const swaggerConfig = new DocumentBuilder()
        .setTitle('HivePoint API')
        .setDescription('HivePoint backend API')
        .setVersion('1.0')
        .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    const openApiService = app.get(OpenApiService);
    openApiService.setDocument(document);

    await app.init();

    return app;
};
