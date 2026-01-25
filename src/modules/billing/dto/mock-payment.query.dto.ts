import { ApiProperty } from '@nestjs/swagger';

export class MockPaymentQueryDto {
    @ApiProperty({ example: 'uuid' })
    invoiceId!: string;
}
