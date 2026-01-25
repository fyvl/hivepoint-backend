import { ApiProperty } from '@nestjs/swagger';
import { VersionStatus } from '@prisma/client';

export class VersionDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'uuid' })
    productId!: string;

    @ApiProperty({ example: 'v1' })
    version!: string;

    @ApiProperty({ enum: VersionStatus })
    status!: VersionStatus;

    @ApiProperty({ example: 'https://example.com/openapi.json' })
    openApiUrl!: string;

    @ApiProperty({ type: String, format: 'date-time' })
    createdAt!: Date;
}
