import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
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
import { CancelSubscriptionResponseDto } from './dto/cancel-subscription-response.dto';
import { SubscriptionListResponseDto } from './dto/list-subscriptions.dto';
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
