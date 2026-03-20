import {
    Controller,
    DefaultValuePipe,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { HideProductResponseDto } from './dto/hide-product-response.dto';
import { HideVersionResponseDto } from './dto/hide-version-response.dto';
import { ListAuditLogsResponseDto } from './dto/list-audit-logs-response.dto';
import { OperationalDashboardResponseDto } from './dto/operational-dashboard.dto';
import { OperationalAlertsResponseDto } from './dto/operational-alert.dto';
import { RevokeKeyResponseDto } from './dto/revoke-key-response.dto';

@ApiTags('admin')
@ApiBearerAuth('bearer')
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @Get('audit-logs')
    @ApiOperation({ summary: 'List recent admin audit logs' })
    @ApiQuery({
        name: 'limit',
        required: false,
        example: 50,
        description: 'Maximum number of recent audit log entries to return',
    })
    @ApiOkResponse({ type: ListAuditLogsResponseDto })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async listAuditLogs(
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    ): Promise<ListAuditLogsResponseDto> {
        const normalizedLimit = Math.min(Math.max(limit, 1), 100);
        return this.adminService.listAuditLogs(normalizedLimit);
    }

    @Get('ops/dashboard')
    @ApiOperation({ summary: 'Get operational dashboard summary' })
    @ApiOkResponse({ type: OperationalDashboardResponseDto })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async getOperationalDashboard(): Promise<OperationalDashboardResponseDto> {
        return this.adminService.getOperationalDashboard();
    }

    @Get('ops/alerts')
    @ApiOperation({ summary: 'List current operational alerts' })
    @ApiOkResponse({ type: OperationalAlertsResponseDto })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async listOperationalAlerts(): Promise<OperationalAlertsResponseDto> {
        return this.adminService.listOperationalAlerts();
    }

    @Post('products/:id/hide')
    @ApiOperation({ summary: 'Hide product' })
    @ApiOkResponse({ type: HideProductResponseDto })
    @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async hideProduct(
        @User() user: AuthenticatedUser,
        @Param('id') id: string,
    ): Promise<HideProductResponseDto> {
        return this.adminService.hideProduct(user, id);
    }

    @Post('versions/:id/hide')
    @ApiOperation({ summary: 'Hide version' })
    @ApiOkResponse({ type: HideVersionResponseDto })
    @ApiNotFoundResponse({ description: 'VERSION_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async hideVersion(
        @User() user: AuthenticatedUser,
        @Param('id') id: string,
    ): Promise<HideVersionResponseDto> {
        return this.adminService.hideVersion(user, id);
    }

    @Post('keys/:id/revoke')
    @ApiOperation({ summary: 'Revoke API key (admin override)' })
    @ApiOkResponse({ type: RevokeKeyResponseDto })
    @ApiNotFoundResponse({ description: 'KEY_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async revokeKey(
        @User() user: AuthenticatedUser,
        @Param('id') id: string,
    ): Promise<RevokeKeyResponseDto> {
        return this.adminService.revokeKey(user, id);
    }
}
