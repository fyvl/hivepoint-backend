import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ZodValidationPipe } from '../../common/utils/zod-validation.pipe';
import {
    createProductSchema,
    createVersionSchema,
    listProductsQuerySchema,
    updateProductSchema,
} from './catalog.schemas';
import type {
    CreateProductInput,
    CreateVersionInput,
    ListProductsQuery,
    UpdateProductInput,
} from './catalog.schemas';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVersionDto } from './dto/create-version.dto';
import { ProductListResponseDto } from './dto/list-products.dto';
import { ProductDto } from './dto/product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { VersionListResponseDto } from './dto/list-versions.dto';
import { VersionDto } from './dto/version.dto';
import { OptionalJwtGuard } from './guards/optional-jwt.guard';
import { ProductsService } from './products.service';
import { VersionsService } from './versions.service';

@ApiTags('catalog')
@Controller('catalog')
export class ProductsController {
    constructor(
        private readonly productsService: ProductsService,
        private readonly versionsService: VersionsService,
    ) {}

    @Get('products')
    @ApiOperation({ summary: 'List published products' })
    @ApiOkResponse({ type: ProductListResponseDto })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'category', required: false, type: String })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'offset', required: false, type: Number })
    async listProducts(
        @Query(new ZodValidationPipe(listProductsQuerySchema))
        query: ListProductsQuery,
    ): Promise<ProductListResponseDto> {
        const limit = Math.min(query.limit ?? 20, 100);
        const offset = query.offset ?? 0;

        return this.productsService.listPublicProducts({
            ...query,
            limit,
            offset,
        });
    }

    @Get('my-products')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'List current seller products (all statuses)' })
    @ApiOkResponse({ type: ProductListResponseDto })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'category', required: false, type: String })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'offset', required: false, type: Number })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    async listMyProducts(
        @Query(new ZodValidationPipe(listProductsQuerySchema))
        query: ListProductsQuery,
        @User() user: AuthenticatedUser,
    ): Promise<ProductListResponseDto> {
        const limit = Math.min(query.limit ?? 20, 100);
        const offset = query.offset ?? 0;

        return this.productsService.listManagedProducts({
            ...query,
            limit,
            offset,
            ownerId: user.role === Role.ADMIN ? undefined : user.id,
        });
    }

    @Get('products/:id')
    @UseGuards(OptionalJwtGuard)
    @ApiOperation({ summary: 'Get product by id' })
    @ApiOkResponse({ type: ProductDto })
    @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'PRODUCT_NOT_PUBLIC or NOT_OWNER' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async getProduct(
        @Param('id') id: string,
        @User() user?: AuthenticatedUser,
    ): Promise<ProductDto> {
        return this.productsService.getProductById(id, user);
    }

    @Get('products/:id/versions')
    @UseGuards(OptionalJwtGuard)
    @ApiOperation({ summary: 'List product versions' })
    @ApiOkResponse({ type: VersionListResponseDto })
    @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'PRODUCT_NOT_PUBLIC or NOT_OWNER' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async listProductVersions(
        @Param('id') id: string,
        @User() user?: AuthenticatedUser,
    ): Promise<VersionListResponseDto> {
        return this.versionsService.listProductVersions(id, user);
    }

    @Post('products')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Create product' })
    @ApiBody({ type: CreateProductDto })
    @ApiOkResponse({ type: ProductDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    async createProduct(
        @Body(new ZodValidationPipe(createProductSchema))
        body: CreateProductInput,
        @User() user: AuthenticatedUser,
    ): Promise<ProductDto> {
        return this.productsService.createProduct(body, user);
    }

    @Patch('products/:id')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Update product' })
    @ApiBody({ type: UpdateProductDto })
    @ApiOkResponse({ type: ProductDto })
    @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'NOT_OWNER' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async updateProduct(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(updateProductSchema))
        body: UpdateProductInput,
        @User() user: AuthenticatedUser,
    ): Promise<ProductDto> {
        return this.productsService.updateProduct(id, body, user);
    }

    @Post('products/:id/versions')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Create product version' })
    @ApiBody({ type: CreateVersionDto })
    @ApiOkResponse({ type: VersionDto })
    @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'NOT_OWNER' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async createVersion(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(createVersionSchema))
        body: CreateVersionInput,
        @User() user: AuthenticatedUser,
    ): Promise<VersionDto> {
        return this.versionsService.createVersion(id, body, user);
    }
}
