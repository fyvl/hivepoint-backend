import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { AppError } from '../../common/errors/app.error';
import { ErrorCodes } from '../../common/errors/error.codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CancelSubscriptionResponseDto } from './dto/cancel-subscription-response.dto';
import { SubscriptionListResponseDto } from './dto/list-subscriptions.dto';
import { SubscriptionDto } from './dto/subscription.dto';

@Injectable()
export class SubscriptionsService {
    constructor(private readonly prisma: PrismaService) {}

    async listUserSubscriptions(user: AuthenticatedUser): Promise<SubscriptionListResponseDto> {
        const subscriptions = await this.prisma.subscription.findMany({
            where: { userId: user.id },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                plan: {
                    select: {
                        id: true,
                        name: true,
                        priceCents: true,
                        currency: true,
                        quotaRequests: true,
                        productId: true,
                        product: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                    },
                },
            },
        });

        const items: SubscriptionDto[] = subscriptions.map((subscription) => ({
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            createdAt: subscription.createdAt,
            updatedAt: subscription.updatedAt,
            plan: {
                id: subscription.plan.id,
                name: subscription.plan.name,
                priceCents: subscription.plan.priceCents,
                currency: subscription.plan.currency,
                quotaRequests: subscription.plan.quotaRequests,
                productId: subscription.plan.productId,
            },
            product: {
                id: subscription.plan.product.id,
                title: subscription.plan.product.title,
            },
        }));

        return { items };
    }

    async cancelSubscription(
        subscriptionId: string,
        user: AuthenticatedUser,
    ): Promise<CancelSubscriptionResponseDto> {
        const subscription = await this.prisma.subscription.findUnique({
            where: { id: subscriptionId },
            select: {
                id: true,
                userId: true,
                cancelAtPeriodEnd: true,
            },
        });

        if (!subscription) {
            throw new AppError({
                code: ErrorCodes.SUBSCRIPTION_NOT_FOUND,
                message: 'SUBSCRIPTION_NOT_FOUND',
                httpStatus: 404,
            });
        }

        if (user.role !== Role.ADMIN && subscription.userId !== user.id) {
            throw new AppError({
                code: ErrorCodes.NOT_OWNER,
                message: 'NOT_OWNER',
                httpStatus: 403,
            });
        }

        if (!subscription.cancelAtPeriodEnd) {
            await this.prisma.subscription.update({
                where: { id: subscriptionId },
                data: { cancelAtPeriodEnd: true },
            });
        }

        return { ok: true, subscriptionId: subscription.id };
    }
}
