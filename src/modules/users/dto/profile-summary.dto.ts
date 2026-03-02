import { ApiProperty } from '@nestjs/swagger';

export class UserProfileSummaryDto {
    @ApiProperty({ example: 2 })
    subscriptionsTotal!: number;

    @ApiProperty({ example: 1 })
    subscriptionsActive!: number;

    @ApiProperty({ example: 3 })
    apiKeysActive!: number;

    @ApiProperty({ example: 4 })
    productsTotal!: number;

    @ApiProperty({ example: 3 })
    productsPublished!: number;

    @ApiProperty({ example: true })
    canUpgradeToSeller!: boolean;
}
