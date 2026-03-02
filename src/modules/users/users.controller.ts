import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBadRequestResponse,
    ApiBody,
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
import { changePasswordSchema, updateMyRoleSchema } from './users.schemas';
import type { ChangePasswordInput, UpdateMyRoleInput } from './users.schemas';
import { ChangePasswordDto, ChangePasswordResponseDto } from './dto/change-password.dto';
import { UserProfileSummaryDto } from './dto/profile-summary.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UserMeResponseDto } from './dto/user-me.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get('me')
    @UseGuards(JwtGuard)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Get current user' })
    @ApiOkResponse({ type: UserMeResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
    async getMe(@User() user: AuthenticatedUser): Promise<UserMeResponseDto> {
        return this.usersService.getMe(user.id);
    }

    @Get('profile-summary')
    @UseGuards(JwtGuard)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Get current user profile summary' })
    @ApiOkResponse({ type: UserProfileSummaryDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
    async getProfileSummary(@User() user: AuthenticatedUser): Promise<UserProfileSummaryDto> {
        return this.usersService.getProfileSummary(user.id);
    }

    @Post('role')
    @UseGuards(JwtGuard)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Upgrade current user role to SELLER' })
    @ApiBody({ type: UpdateUserRoleDto })
    @ApiOkResponse({ type: UserMeResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'FORBIDDEN_ROLE' })
    async updateMyRole(
        @Body(new ZodValidationPipe(updateMyRoleSchema)) body: UpdateMyRoleInput,
        @User() user: AuthenticatedUser,
    ): Promise<UserMeResponseDto> {
        return this.usersService.updateMyRole(user.id, body.role);
    }

    @Post('change-password')
    @UseGuards(JwtGuard)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Change current user password' })
    @ApiBody({ type: ChangePasswordDto })
    @ApiOkResponse({ type: ChangePasswordResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED or INVALID_CURRENT_PASSWORD' })
    @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
    @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
    async changePassword(
        @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
        @User() user: AuthenticatedUser,
    ): Promise<ChangePasswordResponseDto> {
        return this.usersService.changePassword(user.id, body);
    }
}
