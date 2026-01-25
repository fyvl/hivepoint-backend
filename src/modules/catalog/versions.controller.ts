import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
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
import { VersionsService } from './versions.service';

@ApiTags('catalog')
@Controller('catalog')
export class VersionsController {
    constructor(private readonly versionsService: VersionsService) {}

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
