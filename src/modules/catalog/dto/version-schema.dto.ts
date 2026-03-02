import { ApiProperty } from '@nestjs/swagger';

export class VersionSchemaDto {
    @ApiProperty({ example: 'uuid' })
    versionId!: string;

    @ApiProperty({ example: 'uuid' })
    productId!: string;

    @ApiProperty({ example: 'v1' })
    version!: string;

    @ApiProperty({ example: 'https://example.com/openapi.json' })
    openApiUrl!: string;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    fetchedAt!: Date | null;

    @ApiProperty({ example: '{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Sample\"}}' })
    schema!: string;
}
