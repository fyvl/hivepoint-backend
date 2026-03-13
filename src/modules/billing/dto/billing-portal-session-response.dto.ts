import { ApiProperty } from '@nestjs/swagger';

export class BillingPortalSessionResponseDto {
    @ApiProperty({ example: 'https://billing.stripe.com/session/...' })
    url!: string;
}
