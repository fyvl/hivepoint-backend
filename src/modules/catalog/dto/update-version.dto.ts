import { ApiPropertyOptional } from '@nestjs/swagger';
import { VersionStatus } from '@prisma/client';

export class UpdateVersionDto {
    @ApiPropertyOptional({ enum: VersionStatus })
    status?: VersionStatus;

    @ApiPropertyOptional({
        example: 'https://example.com/openapi.json',
        minLength: 5,
        maxLength: 2048,
    })
    openApiUrl?: string;
}
