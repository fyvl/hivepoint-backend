import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
import { createKeySchema } from './keys.schemas';
import type { CreateKeyInput } from './keys.schemas';
import { CreateKeyDto } from './dto/create-key.dto';
import { CreateKeyResponseDto } from './dto/create-key-response.dto';
import { ListKeysResponseDto } from './dto/list-keys-response.dto';
import { RevokeKeyResponseDto } from './dto/revoke-key-response.dto';
import { KeysService } from './keys.service';

@ApiTags('keys')
@ApiBearerAuth('bearer')
@UseGuards(JwtGuard)
@Controller('keys')
export class KeysController {
    constructor(private readonly keysService: KeysService) {}

    @Post()
    @ApiOperation({ summary: 'Create API key' })
    @ApiBody({ type: CreateKeyDto })
    @ApiOkResponse({ type: CreateKeyResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async createKey(
        @Body(new ZodValidationPipe(createKeySchema)) body: CreateKeyInput,
        @User() user: AuthenticatedUser,
    ): Promise<CreateKeyResponseDto> {
        return this.keysService.createKey(body, user);
    }

    @Get()
    @ApiOperation({ summary: 'List API keys' })
    @ApiOkResponse({ type: ListKeysResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async listKeys(
        @User() user: AuthenticatedUser,
    ): Promise<ListKeysResponseDto> {
        return this.keysService.listKeys(user);
    }

    @Post(':id/revoke')
    @ApiOperation({ summary: 'Revoke API key' })
    @ApiOkResponse({ type: RevokeKeyResponseDto })
    @ApiNotFoundResponse({ description: 'KEY_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'NOT_OWNER' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async revokeKey(
        @Param('id') id: string,
        @User() user: AuthenticatedUser,
    ): Promise<RevokeKeyResponseDto> {
        return this.keysService.revokeKey(id, user);
    }
}
