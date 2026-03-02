import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
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
import { ZodValidationPipe } from '../../common/utils/zod-validation.pipe';
import { updateVersionSchema } from './catalog.schemas';
import type { UpdateVersionInput } from './catalog.schemas';
import { UpdateVersionDto } from './dto/update-version.dto';
import { VersionDto } from './dto/version.dto';
import { VersionSchemaDto } from './dto/version-schema.dto';
import { OptionalJwtGuard } from './guards/optional-jwt.guard';
import { VersionsService } from './versions.service';

@ApiTags('catalog')
@Controller('catalog')
export class VersionsController {
    constructor(private readonly versionsService: VersionsService) {}

    @Get('versions/:versionId/schema')
    @UseGuards(OptionalJwtGuard)
    @ApiOperation({ summary: 'Get stored OpenAPI schema snapshot for version' })
    @ApiOkResponse({ type: VersionSchemaDto })
    @ApiNotFoundResponse({ description: 'VERSION_NOT_FOUND or OPENAPI_SCHEMA_NOT_AVAILABLE' })
    @ApiForbiddenResponse({ description: 'PRODUCT_NOT_PUBLIC or NOT_OWNER' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async getVersionSchema(
        @Param('versionId') versionId: string,
        @User() user?: AuthenticatedUser,
    ): Promise<VersionSchemaDto> {
        return this.versionsService.getVersionSchema(versionId, user);
    }

    @Patch('versions/:versionId')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Update version' })
    @ApiBody({ type: UpdateVersionDto })
    @ApiOkResponse({ type: VersionDto })
    @ApiNotFoundResponse({ description: 'VERSION_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'NOT_OWNER' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async updateVersion(
        @Param('versionId') versionId: string,
        @Body(new ZodValidationPipe(updateVersionSchema)) body: UpdateVersionInput,
        @User() user: AuthenticatedUser,
    ): Promise<VersionDto> {
        return this.versionsService.updateVersion(versionId, body, user);
    }
}
