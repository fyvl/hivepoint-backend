import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
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
    ApiResponse,
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
    generateProductDescriptionSchema,
    listProductsQuerySchema,
    suggestProductCategorySchema,
    updateProductSchema,
} from './catalog.schemas';
import type {
    CreateProductInput,
    CreateVersionInput,
    GenerateProductDescriptionInput,
    ListProductsQuery,
    SuggestProductCategoryInput,
    UpdateProductInput,
} from './catalog.schemas';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVersionDto } from './dto/create-version.dto';
import { GenerateProductDescriptionDto } from './dto/generate-product-description.dto';
import { GenerateProductDescriptionResponseDto } from './dto/generate-product-description-response.dto';
import { ProductListResponseDto } from './dto/list-products.dto';
import { ProductDto } from './dto/product.dto';
import { SuggestProductCategoryDto } from './dto/suggest-product-category.dto';
import { SuggestProductCategoryResponseDto } from './dto/suggest-product-category-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { VersionListResponseDto } from './dto/list-versions.dto';
import { VersionDto } from './dto/version.dto';
import { OptionalJwtGuard } from './guards/optional-jwt.guard';
import { ProductCategorySuggestionService } from './product-category-suggestion.service';
import { ProductDescriptionGeneratorService } from './product-description-generator.service';
import { ProductsService } from './products.service';
import { VersionsService } from './versions.service';

@ApiTags('catalog')
@Controller('catalog')
export class ProductsController {
    constructor(
        private readonly productsService: ProductsService,
        private readonly versionsService: VersionsService,
        private readonly productDescriptionGeneratorService: ProductDescriptionGeneratorService,
        private readonly productCategorySuggestionService: ProductCategorySuggestionService,
    ) {}

    @Get('products')
    @ApiOperation({ summary: 'List published products' })
    @ApiOkResponse({ type: ProductListResponseDto })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'category', required: false, type: String })
    @ApiQuery({ name: 'tag', required: false, type: String })
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
    @ApiQuery({ name: 'tag', required: false, type: String })
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

    @Post('ai/product-description')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Generate product description draft with LLM' })
    @ApiBody({ type: GenerateProductDescriptionDto })
    @ApiOkResponse({ type: GenerateProductDescriptionResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiResponse({ status: 503, description: 'LLM_NOT_CONFIGURED' })
    @ApiResponse({ status: 502, description: 'LLM_UPSTREAM_UNAVAILABLE' })
    async generateProductDescription(
        @Body(new ZodValidationPipe(generateProductDescriptionSchema))
        body: GenerateProductDescriptionInput,
    ): Promise<GenerateProductDescriptionResponseDto> {
        return this.productDescriptionGeneratorService.generate(body);
    }

    @Post('ai/category-suggestions')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Suggest product category and tags with ML' })
    @ApiBody({ type: SuggestProductCategoryDto })
    @ApiOkResponse({ type: SuggestProductCategoryResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiResponse({ status: 503, description: 'ML_SUGGESTIONS_DISABLED' })
    @ApiResponse({ status: 502, description: 'ML_UPSTREAM_UNAVAILABLE' })
    async suggestProductCategory(
        @Body(new ZodValidationPipe(suggestProductCategorySchema))
        body: SuggestProductCategoryInput,
    ): Promise<SuggestProductCategoryResponseDto> {
        return this.productCategorySuggestionService.suggest(body);
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
