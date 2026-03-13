import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { HideProductResponseDto } from './dto/hide-product-response.dto';
import { HideVersionResponseDto } from './dto/hide-version-response.dto';
import { RevokeKeyResponseDto } from './dto/revoke-key-response.dto';

@ApiTags('admin')
@ApiBearerAuth('bearer')
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @Post('products/:id/hide')
    @ApiOperation({ summary: 'Hide product' })
    @ApiOkResponse({ type: HideProductResponseDto })
    @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async hideProduct(
        @Param('id') id: string,
    ): Promise<HideProductResponseDto> {
        return this.adminService.hideProduct(id);
    }

    @Post('versions/:id/hide')
    @ApiOperation({ summary: 'Hide version' })
    @ApiOkResponse({ type: HideVersionResponseDto })
    @ApiNotFoundResponse({ description: 'VERSION_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async hideVersion(
        @Param('id') id: string,
    ): Promise<HideVersionResponseDto> {
        return this.adminService.hideVersion(id);
    }

    @Post('keys/:id/revoke')
    @ApiOperation({ summary: 'Revoke API key (admin override)' })
    @ApiOkResponse({ type: RevokeKeyResponseDto })
    @ApiNotFoundResponse({ description: 'KEY_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async revokeKey(@Param('id') id: string): Promise<RevokeKeyResponseDto> {
        return this.adminService.revokeKey(id);
    }
}
