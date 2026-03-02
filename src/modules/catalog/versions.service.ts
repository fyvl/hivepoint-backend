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
import { VersionSchemaDto } from './dto/version-schema.dto';

const versionSelect = {
    id: true,
    productId: true,
    version: true,
    status: true,
    openApiUrl: true,
    createdAt: true,
} as const;

const OPENAPI_FETCH_TIMEOUT_MS = 15000;
const OPENAPI_MAX_SIZE_BYTES = 2_000_000;

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

        const openApiSnapshot = await this.fetchOpenApiSnapshot(input.openApiUrl);

        return this.prisma.apiVersion.create({
            data: {
                productId,
                version: input.version,
                openApiUrl: input.openApiUrl,
                openApiSnapshot,
                openApiFetchedAt: new Date(),
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
            const openApiSnapshot = await this.fetchOpenApiSnapshot(input.openApiUrl);
            data.openApiUrl = input.openApiUrl;
            data.openApiSnapshot = openApiSnapshot;
            data.openApiFetchedAt = new Date();
        }

        return this.prisma.apiVersion.update({
            where: { id: versionId },
            data,
            select: versionSelect,
        });
    }

    async getVersionSchema(
        versionId: string,
        user?: AuthenticatedUser,
    ): Promise<VersionSchemaDto> {
        const version = await this.prisma.apiVersion.findUnique({
            where: { id: versionId },
            select: {
                id: true,
                productId: true,
                version: true,
                status: true,
                openApiUrl: true,
                openApiSnapshot: true,
                openApiFetchedAt: true,
                product: {
                    select: {
                        ownerId: true,
                        status: true,
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

        const isOwnerAdmin = this.isOwnerOrAdmin(version.product, user);
        const isPublic =
            version.product.status === ProductStatus.PUBLISHED &&
            version.status === VersionStatus.PUBLISHED;

        if (!isPublic && !isOwnerAdmin) {
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

        if (!version.openApiSnapshot) {
            throw new AppError({
                code: ErrorCodes.NOT_FOUND,
                message: 'OPENAPI_SCHEMA_NOT_AVAILABLE',
                httpStatus: 404,
            });
        }

        return {
            versionId: version.id,
            productId: version.productId,
            version: version.version,
            openApiUrl: version.openApiUrl,
            fetchedAt: version.openApiFetchedAt ?? null,
            schema: version.openApiSnapshot,
        };
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

    private async fetchOpenApiSnapshot(openApiUrl: string): Promise<string> {
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), OPENAPI_FETCH_TIMEOUT_MS);

        try {
            const response = await fetch(openApiUrl, {
                method: 'GET',
                signal: abortController.signal,
                headers: {
                    Accept: 'application/json, application/yaml, text/yaml, text/plain;q=0.8, */*;q=0.1',
                },
            });

            if (!response.ok) {
                throw new AppError({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: 'OPENAPI_FETCH_FAILED',
                    httpStatus: 400,
                    details: {
                        reason: 'HTTP_ERROR',
                        status: response.status,
                        url: openApiUrl,
                    },
                });
            }

            const body = await response.text();
            const trimmed = body.trim();
            if (!trimmed) {
                throw new AppError({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: 'OPENAPI_FETCH_FAILED',
                    httpStatus: 400,
                    details: {
                        reason: 'EMPTY_BODY',
                        url: openApiUrl,
                    },
                });
            }

            const sizeBytes = Buffer.byteLength(body, 'utf8');
            if (sizeBytes > OPENAPI_MAX_SIZE_BYTES) {
                throw new AppError({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: 'OPENAPI_FETCH_FAILED',
                    httpStatus: 400,
                    details: {
                        reason: 'TOO_LARGE',
                        limitBytes: OPENAPI_MAX_SIZE_BYTES,
                        actualBytes: sizeBytes,
                        url: openApiUrl,
                    },
                });
            }

            return body;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            throw new AppError({
                code: ErrorCodes.VALIDATION_ERROR,
                message: 'OPENAPI_FETCH_FAILED',
                httpStatus: 400,
                details: {
                    reason: 'NETWORK_ERROR',
                    url: openApiUrl,
                },
            });
        } finally {
            clearTimeout(timeout);
        }
    }
}
