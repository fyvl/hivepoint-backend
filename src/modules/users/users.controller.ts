import { Controller, Get, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { User, AuthenticatedUser } from '../../common/decorators/user.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
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
}
