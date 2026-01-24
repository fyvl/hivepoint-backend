import { Module } from '@nestjs/common';
import { OpenApiModule } from '../../common/openapi/openapi.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SwaggerAuthDocumentUpdater } from './swagger-auth.provider';

@Module({
    imports: [PrismaModule, OpenApiModule],
    controllers: [AuthController],
    providers: [AuthService, JwtGuard, RolesGuard, SwaggerAuthDocumentUpdater],
    exports: [AuthService, JwtGuard, RolesGuard],
})
export class AuthModule {}
