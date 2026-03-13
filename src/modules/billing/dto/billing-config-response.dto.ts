import { ApiProperty } from '@nestjs/swagger';

export class BillingConfigResponseDto {
    @ApiProperty({ enum: ['MOCK', 'STRIPE'] })
    paymentProvider!: 'MOCK' | 'STRIPE';

    @ApiProperty({ example: true })
    customerPortalAvailable!: boolean;
}
