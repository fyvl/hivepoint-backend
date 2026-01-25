import { ApiProperty } from '@nestjs/swagger';

export class CancelSubscriptionResponseDto {
    @ApiProperty({ example: true })
    ok!: boolean;

    @ApiProperty({ example: 'uuid' })
    subscriptionId!: string;
}
