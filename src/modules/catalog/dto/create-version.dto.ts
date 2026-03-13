import { ApiProperty } from '@nestjs/swagger';

export class CreateVersionDto {
    @ApiProperty({ example: 'v1', minLength: 1, maxLength: 20 })
    version!: string;

    @ApiProperty({
        example: 'https://example.com/openapi.json',
        minLength: 5,
        maxLength: 2048,
    })
    openApiUrl!: string;
}
