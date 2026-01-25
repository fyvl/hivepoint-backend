import { ApiProperty } from '@nestjs/swagger';

export class MockPaymentResponseDto {
    @ApiProperty({ example: true })
    ok!: boolean;
}
