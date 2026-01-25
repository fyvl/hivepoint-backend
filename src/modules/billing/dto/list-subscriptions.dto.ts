import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionDto } from './subscription.dto';

export class SubscriptionListResponseDto {
    @ApiProperty({ type: [SubscriptionDto] })
    items!: SubscriptionDto[];
}
