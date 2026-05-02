import { ApiProperty } from '@nestjs/swagger';

export class GenerateProductDescriptionResponseDto {
    @ApiProperty({
        example:
            'Accept card payments, invoices, and payout workflows through a developer-friendly API built for modern commerce teams.',
    })
    description!: string;
}
