import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBadRequestResponse,
    ApiBody,
    ApiForbiddenResponse,
    ApiHeader,
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
import { RecordUsageDto } from './dto/record-usage.dto';
import { RecordUsageResponseDto } from './dto/record-usage-response.dto';
import { UsageSummaryResponseDto } from './dto/usage-summary.dto';
import { recordUsageSchema } from './usage.schemas';
import type { RecordUsageInput } from './usage.schemas';
import { UsageService } from './usage.service';

@ApiTags('usage')
@Controller('usage')
export class UsageController {
    constructor(private readonly usageService: UsageService) {}

    @Post('record')
    @ApiOperation({ summary: 'Ingest usage record' })
    @ApiHeader({ name: 'x-usage-secret', required: true })
    @ApiBody({ type: RecordUsageDto })
    @ApiOkResponse({ type: RecordUsageResponseDto })
    @ApiBadRequestResponse({ description: 'SUBSCRIPTION_NOT_ACTIVE or VALIDATION_ERROR' })
    @ApiForbiddenResponse({ description: 'USAGE_INGEST_FORBIDDEN' })
    @ApiNotFoundResponse({ description: 'SUBSCRIPTION_NOT_FOUND' })
    async recordUsage(
        @Body(new ZodValidationPipe(recordUsageSchema)) body: RecordUsageInput,
        @Headers('x-usage-secret') usageSecret?: string | string[],
    ): Promise<RecordUsageResponseDto> {
        const secretValue = Array.isArray(usageSecret) ? usageSecret[0] : usageSecret;
        return this.usageService.ingestUsage(body, secretValue);
    }

    @Get('summary')
    @UseGuards(JwtGuard)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Usage summary for current user' })
    @ApiOkResponse({ type: UsageSummaryResponseDto })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async getSummary(@User() user: AuthenticatedUser): Promise<UsageSummaryResponseDto> {
        return this.usageService.getSummary(user);
    }
}
