import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
import { User } from '../../common/decorators/user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/user.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { ZodValidationPipe } from '../../common/utils/zod-validation.pipe';
import { updateMyRoleSchema } from './users.schemas';
import type { UpdateMyRoleInput } from './users.schemas';
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
}
