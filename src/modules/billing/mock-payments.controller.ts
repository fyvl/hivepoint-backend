import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import {
    ApiHeader,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
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

    @Get('mock/pay')
    @ApiOperation({ summary: 'Mock payment helper page' })
    @ApiQuery({ name: 'invoiceId', required: true, type: String })
    renderMockPaymentPage(
        @Query(new ZodValidationPipe(mockPaymentQuerySchema))
        query: MockPaymentQuery,
        @Res() response: Response,
    ): void {
        response.type('html').send(this.buildMockPaymentPage(query.invoiceId));
    }

    @Post('mock/succeed')
    @UseGuards(MockPaymentGuard)
    @ApiOperation({ summary: 'Mock payment success' })
    @ApiHeader({ name: 'x-mock-payment-secret', required: true })
    @ApiQuery({ name: 'invoiceId', required: true, type: String })
    @ApiOkResponse({ type: MockPaymentResponseDto })
    @ApiNotFoundResponse({ description: 'INVOICE_NOT_FOUND' })
    @ApiForbiddenResponse({ description: 'MOCK_PAYMENT_FORBIDDEN' })
    async succeed(
        @Query(new ZodValidationPipe(mockPaymentQuerySchema))
        query: MockPaymentQuery,
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
        @Query(new ZodValidationPipe(mockPaymentQuerySchema))
        query: MockPaymentQuery,
    ): Promise<MockPaymentResponseDto> {
        return this.subscriptionsService.mockFail(query.invoiceId);
    }

    private buildMockPaymentPage(invoiceId: string): string {
        const escapedInvoiceId = this.escapeHtml(invoiceId);

        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mock Checkout</title>
  <style>
    body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; }
    main { max-width: 720px; margin: 48px auto; padding: 32px; background: #111827; border-radius: 16px; }
    h1 { margin-top: 0; }
    code, input { font-family: Consolas, monospace; }
    input { width: 100%; padding: 12px; margin: 8px 0 16px; border-radius: 8px; border: 1px solid #334155; background: #020617; color: inherit; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    button { padding: 12px 18px; border: 0; border-radius: 999px; cursor: pointer; font-weight: 600; }
    .success { background: #10b981; color: #052e16; }
    .danger { background: #f97316; color: #431407; }
    .muted { color: #94a3b8; }
    pre { background: #020617; padding: 16px; border-radius: 12px; overflow: auto; }
  </style>
</head>
<body>
  <main>
    <h1>Mock Checkout</h1>
    <p class="muted">Use this local helper page to trigger mock billing outcomes for invoice <code>${escapedInvoiceId}</code>.</p>
    <label for="secret">x-mock-payment-secret</label>
    <input id="secret" placeholder="Enter MOCK_PAYMENT_SECRET from backend env" />
    <div class="actions">
      <button class="success" onclick="submitMock('succeed')">Mark paid</button>
      <button class="danger" onclick="submitMock('fail')">Mark failed</button>
    </div>
    <pre id="result">No action sent yet.</pre>
  </main>
  <script>
    async function submitMock(action) {
      const secret = document.getElementById('secret').value.trim();
      const result = document.getElementById('result');
      if (!secret) {
        result.textContent = 'Provide x-mock-payment-secret first.';
        return;
      }

      result.textContent = 'Sending...';
      try {
        const response = await fetch('/billing/mock/' + action + '?invoiceId=${escapedInvoiceId}', {
          method: 'POST',
          headers: { 'x-mock-payment-secret': secret }
        });
        const body = await response.text();
        result.textContent = body || response.statusText;
      } catch (error) {
        result.textContent = String(error);
      }
    }
  </script>
</body>
</html>`;
    }

    private escapeHtml(value: string): string {
        return value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }
}
