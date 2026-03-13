import { ApiProperty } from '@nestjs/swagger';

export class SubscribeResponseDto {
    @ApiProperty({ example: 'uuid' })
    subscriptionId!: string;

    @ApiProperty({ example: 'uuid' })
    invoiceId!: string;

    @ApiProperty({
        example: 'http://localhost:3000/billing/mock/pay?invoiceId=uuid',
    })
    paymentLink!: string;
}
