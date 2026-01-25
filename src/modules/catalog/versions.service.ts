import { Injectable } from '@nestjs/common';
import { ProductStatus, Role, VersionStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CreateVersionInput, UpdateVersionInput } from './catalog.schemas';
import { VersionDto } from './dto/version.dto';
import { VersionListResponseDto } from './dto/list-versions.dto';

const versionSelect = {
    id: true,
    productId: true,
    version: true,
    status: true,
    openApiUrl: true,
    createdAt: true,
} as const;

@Injectable()
export class VersionsService {
    constructor(private readonly prisma: PrismaService) {}

    async listProductVersions(
        productId: string,
        user?: AuthenticatedUser,
    ): Promise<VersionListResponseDto> {
        const product = await this.prisma.apiProduct.findUnique({
            where: { id: productId },
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

        const isOwnerAdmin = this.isOwnerOrAdmin(product, user);
        if (product.status !== ProductStatus.PUBLISHED && !isOwnerAdmin) {
            if (!user) {
                throw new AppError({
                    code: ErrorCodes.PRODUCT_NOT_PUBLIC,
                    message: 'PRODUCT_NOT_PUBLIC',
                    httpStatus: 403,
                });
            }

            throw new AppError({
                code: ErrorCodes.NOT_OWNER,
                message: 'NOT_OWNER',
                httpStatus: 403,
            });
        }

        const where: Prisma.ApiVersionWhereInput = {
            productId,
        };

        if (!isOwnerAdmin) {
            where.status = VersionStatus.PUBLISHED;
        }

        const items = await this.prisma.apiVersion.findMany({
            where,
            orderBy: {
                createdAt: 'desc',
            },
            select: versionSelect,
        });

        return { items };
    }

    async createVersion(
        productId: string,
        input: CreateVersionInput,
        user: AuthenticatedUser,
    ): Promise<VersionDto> {
        const product = await this.prisma.apiProduct.findUnique({
            where: { id: productId },
            select: {
                id: true,
                ownerId: true,
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

        const existingVersion = await this.prisma.apiVersion.findFirst({
            where: {
                productId,
                version: input.version,
            },
            select: {
                id: true,
            },
        });

        if (existingVersion) {
            throw new AppError({
                code: ErrorCodes.VERSION_ALREADY_EXISTS,
                message: 'VERSION_ALREADY_EXISTS',
                httpStatus: 409,
            });
        }

        return this.prisma.apiVersion.create({
            data: {
                productId,
                version: input.version,
                openApiUrl: input.openApiUrl,
                status: VersionStatus.DRAFT,
            },
            select: versionSelect,
        });
    }

    async updateVersion(
        versionId: string,
        input: UpdateVersionInput,
        user: AuthenticatedUser,
    ): Promise<VersionDto> {
        const version = await this.prisma.apiVersion.findUnique({
            where: { id: versionId },
            select: {
                id: true,
                status: true,
                product: {
                    select: {
                        ownerId: true,
                    },
                },
            },
        });

        if (!version) {
            throw new AppError({
                code: ErrorCodes.VERSION_NOT_FOUND,
                message: 'VERSION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (!this.isOwnerOrAdmin(version.product, user)) {
            throw new AppError({
                code: ErrorCodes.NOT_OWNER,
                message: 'NOT_OWNER',
                httpStatus: 403,
            });
        }

        if (input.status && !this.isVersionStatusTransitionAllowed(version.status, input.status)) {
            throw new AppError({
                code: ErrorCodes.VALIDATION_ERROR,
                message: 'INVALID_STATUS_TRANSITION',
                httpStatus: 400,
            });
        }

        const data: Prisma.ApiVersionUpdateInput = {};

        if (input.status !== undefined) {
            data.status = input.status;
        }

        if (input.openApiUrl !== undefined) {
            data.openApiUrl = input.openApiUrl;
        }

        return this.prisma.apiVersion.update({
            where: { id: versionId },
            data,
            select: versionSelect,
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

    private isVersionStatusTransitionAllowed(
        current: VersionStatus,
        next: VersionStatus,
    ): boolean {
        if (current === next) {
            return true;
        }

        if (current === VersionStatus.DRAFT && next === VersionStatus.PUBLISHED) {
            return true;
        }

        if (current === VersionStatus.PUBLISHED && next === VersionStatus.DRAFT) {
            return true;
        }

        return false;
    }
}
