import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiConflictResponse,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { User } from '../../common/decorators/user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { ZodValidationPipe } from '../../common/utils/zod-validation.pipe';
import { subscribeSchema } from './billing.schemas';
import type { SubscribeInput } from './billing.schemas';
import { CancelSubscriptionResponseDto } from './dto/cancel-subscription-response.dto';
import { SubscriptionListResponseDto } from './dto/list-subscriptions.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { SubscribeResponseDto } from './dto/subscribe-response.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('billing')
@Controller('billing')
export class SubscriptionsController {
    constructor(private readonly subscriptionsService: SubscriptionsService) {}

    @Get('subscriptions')
    @UseGuards(JwtGuard)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'List current user subscriptions' })
    @ApiOkResponse({ type: SubscriptionListResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async listSubscriptions(
        @User() user: AuthenticatedUser,
    ): Promise<SubscriptionListResponseDto> {
        return this.subscriptionsService.listUserSubscriptions(user);
    }

    @Post('subscribe')
    @UseGuards(JwtGuard)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Subscribe to plan' })
    @ApiBody({ type: SubscribeDto })
    @ApiOkResponse({ type: SubscribeResponseDto })
    @ApiNotFoundResponse({ description: 'PLAN_NOT_FOUND or PRODUCT_NOT_FOUND' })
    @ApiConflictResponse({ description: 'ALREADY_SUBSCRIBED or SUBSCRIPTION_PENDING' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async subscribe(
        @Body(new ZodValidationPipe(subscribeSchema)) body: SubscribeInput,
        @User() user: AuthenticatedUser,
    ): Promise<SubscribeResponseDto> {
        return this.subscriptionsService.subscribe(body.planId, user);
    }

    @Post('subscriptions/:id/cancel')
    @UseGuards(JwtGuard)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Cancel subscription at period end' })
    @ApiOkResponse({ type: CancelSubscriptionResponseDto })
    @ApiNotFoundResponse({ description: 'SUBSCRIPTION_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'NOT_OWNER' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async cancelSubscription(
        @Param('id') id: string,
        @User() user: AuthenticatedUser,
    ): Promise<CancelSubscriptionResponseDto> {
        return this.subscriptionsService.cancelSubscription(id, user);
    }
}
