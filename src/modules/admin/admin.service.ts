import { Injectable } from '@nestjs/common';
import { ProductStatus, VersionStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HideProductResponseDto } from './dto/hide-product-response.dto';
import { HideVersionResponseDto } from './dto/hide-version-response.dto';
import { RevokeKeyResponseDto } from './dto/revoke-key-response.dto';

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) {}

    async hideProduct(productId: string): Promise<HideProductResponseDto> {
        const product = await this.prisma.apiProduct.findUnique({
            where: { id: productId },
            select: {
                id: true,
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

        if (product.status !== ProductStatus.HIDDEN) {
            await this.prisma.apiProduct.update({
                where: { id: product.id },
                data: { status: ProductStatus.HIDDEN },
            });
        }

        return { ok: true, productId: product.id };
    }

    async hideVersion(versionId: string): Promise<HideVersionResponseDto> {
        const version = await this.prisma.apiVersion.findUnique({
            where: { id: versionId },
            select: {
                id: true,
                status: true,
            },
        });

        if (!version) {
            throw new AppError({
                code: ErrorCodes.VERSION_NOT_FOUND,
                message: 'VERSION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (version.status !== VersionStatus.DRAFT) {
            await this.prisma.apiVersion.update({
                where: { id: version.id },
                data: { status: VersionStatus.DRAFT },
            });
        }

        return { ok: true, versionId: version.id };
    }

    async revokeKey(keyId: string): Promise<RevokeKeyResponseDto> {
        const apiKey = await this.prisma.apiKey.findUnique({
            where: { id: keyId },
            select: {
                id: true,
                isActive: true,
                revokedAt: true,
            },
        });

        if (!apiKey) {
            throw new AppError({
                code: ErrorCodes.KEY_NOT_FOUND,
                message: 'KEY_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (apiKey.isActive && !apiKey.revokedAt) {
            await this.prisma.apiKey.update({
                where: { id: apiKey.id },
                data: {
                    isActive: false,
                    revokedAt: new Date(),
                },
            });
        }

        return { ok: true, keyId: apiKey.id };
    }
}
