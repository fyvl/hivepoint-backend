import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppConfigService } from './common/config/config.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { OpenApiService } from './common/openapi/openapi.service';
import { PrismaService } from './common/prisma/prisma.service';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);

    const configService = app.get(AppConfigService);

    const corsOrigins = configService.corsOrigins;
    app.enableCors({
        origin: corsOrigins.includes('*') ? true : corsOrigins,
        credentials: true,
    });

    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());

    const swaggerConfig = new DocumentBuilder()
        .setTitle('HivePoint API')
        .setDescription('HivePoint backend API')
        .setVersion('1.0')
        .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document);

    const openApiService = app.get(OpenApiService);
    openApiService.setDocument(document);

    const prismaService = app.get(PrismaService);
    await prismaService.enableShutdownHooks(app);

    await app.listen(configService.port);
}

void bootstrap();
