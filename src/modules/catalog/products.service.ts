import { Injectable } from '@nestjs/common';
import { ProductStatus, Role } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
    CreateProductInput,
    ListProductsQuery,
    UpdateProductInput,
} from './catalog.schemas';
import { ProductDto } from './dto/product.dto';
import { ProductListResponseDto } from './dto/list-products.dto';

const productSelect = {
    id: true,
    ownerId: true,
    title: true,
    description: true,
    category: true,
    tags: true,
    status: true,
    createdAt: true,
    updatedAt: true,
} as const;

@Injectable()
export class ProductsService {
    constructor(private readonly prisma: PrismaService) {}

    async listPublicProducts(params: ListProductsQuery & { limit: number; offset: number }): Promise<ProductListResponseDto> {
        const where: Prisma.ApiProductWhereInput = {
            status: ProductStatus.PUBLISHED,
        };

        if (params.search) {
            where.title = {
                contains: params.search,
                mode: 'insensitive',
            };
        }

        if (params.category) {
            where.category = params.category;
        }

        const [items, total] = await Promise.all([
            this.prisma.apiProduct.findMany({
                where,
                skip: params.offset,
                take: params.limit,
                orderBy: {
                    createdAt: 'desc',
                },
                select: productSelect,
            }),
            this.prisma.apiProduct.count({ where }),
        ]);

        return {
            items,
            total,
            limit: params.limit,
            offset: params.offset,
        };
    }

    async listManagedProducts(
        params: ListProductsQuery & { limit: number; offset: number; ownerId?: string },
    ): Promise<ProductListResponseDto> {
        const where: Prisma.ApiProductWhereInput = {};

        if (params.ownerId) {
            where.ownerId = params.ownerId;
        }

        if (params.search) {
            where.title = {
                contains: params.search,
                mode: 'insensitive',
            };
        }

        if (params.category) {
            where.category = params.category;
        }

        const [items, total] = await Promise.all([
            this.prisma.apiProduct.findMany({
                where,
                skip: params.offset,
                take: params.limit,
                orderBy: {
                    createdAt: 'desc',
                },
                select: productSelect,
            }),
            this.prisma.apiProduct.count({ where }),
        ]);

        return {
            items,
            total,
            limit: params.limit,
            offset: params.offset,
        };
    }

    async getProductById(id: string, user?: AuthenticatedUser): Promise<ProductDto> {
        const product = await this.prisma.apiProduct.findUnique({
            where: { id },
            select: productSelect,
        });

        if (!product) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_FOUND,
                message: 'PRODUCT_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (product.status !== ProductStatus.PUBLISHED) {
            if (!user) {
                throw new AppError({
                    code: ErrorCodes.PRODUCT_NOT_PUBLIC,
                    message: 'PRODUCT_NOT_PUBLIC',
                    httpStatus: 403,
                });
            }

            if (!this.isOwnerOrAdmin(product, user)) {
                throw new AppError({
                    code: ErrorCodes.NOT_OWNER,
                    message: 'NOT_OWNER',
                    httpStatus: 403,
                });
            }
        }

        return product;
    }

    async createProduct(input: CreateProductInput, user: AuthenticatedUser): Promise<ProductDto> {
        return this.prisma.apiProduct.create({
            data: {
                ownerId: user.id,
                title: input.title,
                description: input.description,
                category: input.category,
                tags: input.tags,
                status: ProductStatus.DRAFT,
            },
            select: productSelect,
        });
    }

    async updateProduct(
        id: string,
        input: UpdateProductInput,
        user: AuthenticatedUser,
    ): Promise<ProductDto> {
        const product = await this.prisma.apiProduct.findUnique({
            where: { id },
            select: {
                id: true,
                ownerId: true,
                status: true,
            },
        });

        if (!product) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_FOUND,
                message: 'PRODUCT_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (!this.isOwnerOrAdmin(product, user)) {
            throw new AppError({
                code: ErrorCodes.NOT_OWNER,
                message: 'NOT_OWNER',
                httpStatus: 403,
            });
        }

        if (input.status && !this.isProductStatusTransitionAllowed(product.status, input.status)) {
            throw new AppError({
                code: ErrorCodes.VALIDATION_ERROR,
                message: 'INVALID_STATUS_TRANSITION',
                httpStatus: 400,
            });
        }

        const data: Prisma.ApiProductUpdateInput = {};

        if (input.title !== undefined) {
            data.title = input.title;
        }
        if (input.description !== undefined) {
            data.description = input.description;
        }
        if (input.category !== undefined) {
            data.category = input.category;
        }
        if (input.tags !== undefined) {
            data.tags = input.tags;
        }
        if (input.status !== undefined) {
            data.status = input.status;
        }

        return this.prisma.apiProduct.update({
            where: { id },
            data,
            select: productSelect,
        });
    }

    private isOwnerOrAdmin(
        product: { ownerId: string },
        user?: AuthenticatedUser,
    ): boolean {
        if (!user) {
            return false;
        }

        return user.role === Role.ADMIN || user.id === product.ownerId;
    }

    private isProductStatusTransitionAllowed(
        current: ProductStatus,
        next: ProductStatus,
    ): boolean {
        if (current === next) {
            return true;
        }

        if (current === ProductStatus.DRAFT && next === ProductStatus.PUBLISHED) {
            return true;
        }

        if (current === ProductStatus.PUBLISHED && next === ProductStatus.HIDDEN) {
            return true;
        }

        if (current === ProductStatus.HIDDEN && next === ProductStatus.PUBLISHED) {
            return true;
        }

        return false;
    }
}
