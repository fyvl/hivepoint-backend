import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
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
import { ZodValidationPipe } from '../../common/utils/zod-validation.pipe';
import { OptionalJwtGuard } from '../catalog/guards/optional-jwt.guard';
import { createPlanSchema, getPlansQuerySchema } from './billing.schemas';
import type { CreatePlanInput, GetPlansQuery } from './billing.schemas';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanListResponseDto } from './dto/list-plans.dto';
import { PlanDto } from './dto/plan.dto';
import { PlansService } from './plans.service';

@ApiTags('billing')
@Controller('billing')
export class PlansController {
    constructor(private readonly plansService: PlansService) {}

    @Get('plans')
    @UseGuards(OptionalJwtGuard)
    @ApiOperation({ summary: 'List active plans for product' })
    @ApiOkResponse({ type: PlanListResponseDto })
    @ApiQuery({ name: 'productId', required: true, type: String })
    @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'PRODUCT_NOT_PUBLIC' })
    async listPlans(
        @Query(new ZodValidationPipe(getPlansQuerySchema)) query: GetPlansQuery,
        @User() user?: AuthenticatedUser,
    ): Promise<PlanListResponseDto> {
        return this.plansService.listActivePlans(query.productId, user);
    }

    @Post('plans')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Create plan for product' })
    @ApiBody({ type: CreatePlanDto })
    @ApiOkResponse({ type: PlanDto })
    @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'NOT_OWNER or FORBIDDEN_ROLE' })
    @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
    async createPlan(
        @Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanInput,
        @User() user: AuthenticatedUser,
    ): Promise<PlanDto> {
        return this.plansService.createPlan(body, user);
    }
}
