import { Controller, Get, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SellerAnalyticsOverviewResponseDto } from './dto/seller-analytics-overview.dto';
import { AnalyticsService } from './analytics.service';

@ApiTags('seller-analytics')
@Controller('seller/analytics')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) {}

    @Get('overview')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Get seller analytics overview' })
    @ApiOkResponse({ type: SellerAnalyticsOverviewResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    async getOverview(
        @User() user: AuthenticatedUser,
    ): Promise<SellerAnalyticsOverviewResponseDto> {
        return this.analyticsService.getSellerOverview(user);
    }
}
