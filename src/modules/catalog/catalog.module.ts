import { Module } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ProductsController } from './products.controller';
import { ProductCategorySuggestionService } from './product-category-suggestion.service';
import { ProductDescriptionGeneratorService } from './product-description-generator.service';
import { ProductsService } from './products.service';
import { VersionsController } from './versions.controller';
import { VersionsService } from './versions.service';
import { OptionalJwtGuard } from './guards/optional-jwt.guard';

@Module({
    imports: [PrismaModule],
    controllers: [ProductsController, VersionsController],
    providers: [
        ProductsService,
        VersionsService,
        ProductCategorySuggestionService,
        ProductDescriptionGeneratorService,
        JwtGuard,
        RolesGuard,
        OptionalJwtGuard,
    ],
})
export class CatalogModule {}
