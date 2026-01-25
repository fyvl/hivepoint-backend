import { Injectable } from '@nestjs/common';
import { PlanPeriod, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CreatePlanInput } from './billing.schemas';
import { PlanListResponseDto } from './dto/list-plans.dto';
import { PlanDto } from './dto/plan.dto';

const planSelect = {
    id: true,
    productId: true,
    name: true,
    priceCents: true,
    currency: true,
    period: true,
    quotaRequests: true,
    isActive: true,
    createdAt: true,
} as const;

@Injectable()
export class PlansService {
    constructor(private readonly prisma: PrismaService) {}

    async listActivePlans(productId: string): Promise<PlanListResponseDto> {
        const product = await this.prisma.apiProduct.findUnique({
            where: { id: productId },
            select: { id: true },
        });

        if (!product) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_FOUND,
                message: 'PRODUCT_NOT_FOUND',
                httpStatus: 404,
            });
        }

        const items = await this.prisma.plan.findMany({
            where: {
                productId,
                isActive: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            select: planSelect,
        });

        return { items };
    }

    async createPlan(input: CreatePlanInput, user: AuthenticatedUser): Promise<PlanDto> {
        if (user.role !== Role.SELLER && user.role !== Role.ADMIN) {
            throw new AppError({
                code: ErrorCodes.FORBIDDEN_ROLE,
                message: 'FORBIDDEN_ROLE',
                httpStatus: 403,
            });
        }

        const product = await this.prisma.apiProduct.findUnique({
            where: { id: input.productId },
            select: { id: true, ownerId: true },
        });

        if (!product) {
            throw new AppError({
                code: ErrorCodes.PRODUCT_NOT_FOUND,
                message: 'PRODUCT_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (user.role === Role.SELLER && product.ownerId !== user.id) {
            throw new AppError({
                code: ErrorCodes.NOT_OWNER,
                message: 'NOT_OWNER',
                httpStatus: 403,
            });
        }

        return this.prisma.plan.create({
            data: {
                productId: input.productId,
                name: input.name,
                priceCents: input.priceCents,
                currency: input.currency ?? 'EUR',
                period: input.period ?? PlanPeriod.MONTH,
                quotaRequests: input.quotaRequests,
                isActive: input.isActive ?? true,
            },
            select: planSelect,
        });
    }
}
