import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import {
    ApiHeader,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/utils/zod-validation.pipe';
import { mockPaymentQuerySchema } from './billing.schemas';
import type { MockPaymentQuery } from './billing.schemas';
import { MockPaymentResponseDto } from './dto/mock-payment-response.dto';
import { MockPaymentGuard } from './guards/mock-payment.guard';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('billing')
@Controller('billing')
export class MockPaymentsController {
    constructor(private readonly subscriptionsService: SubscriptionsService) {}

    @Post('mock/succeed')
    @UseGuards(MockPaymentGuard)
    @ApiOperation({ summary: 'Mock payment success' })
    @ApiHeader({ name: 'x-mock-payment-secret', required: true })
    @ApiQuery({ name: 'invoiceId', required: true, type: String })
    @ApiOkResponse({ type: MockPaymentResponseDto })
    @ApiNotFoundResponse({ description: 'INVOICE_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'MOCK_PAYMENT_FORBIDDEN' })
    async succeed(
        @Query(new ZodValidationPipe(mockPaymentQuerySchema)) query: MockPaymentQuery,
    ): Promise<MockPaymentResponseDto> {
        return this.subscriptionsService.mockSucceed(query.invoiceId);
    }

    @Post('mock/fail')
    @UseGuards(MockPaymentGuard)
    @ApiOperation({ summary: 'Mock payment failure' })
    @ApiHeader({ name: 'x-mock-payment-secret', required: true })
    @ApiQuery({ name: 'invoiceId', required: true, type: String })
    @ApiOkResponse({ type: MockPaymentResponseDto })
    @ApiNotFoundResponse({ description: 'INVOICE_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'MOCK_PAYMENT_FORBIDDEN' })
    async fail(
        @Query(new ZodValidationPipe(mockPaymentQuerySchema)) query: MockPaymentQuery,
    ): Promise<MockPaymentResponseDto> {
        return this.subscriptionsService.mockFail(query.invoiceId);
    }
}
