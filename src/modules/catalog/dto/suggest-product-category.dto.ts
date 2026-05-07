import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuggestProductCategoryDto {
    @ApiProperty({ example: 'Email validation API', minLength: 3, maxLength: 120 })
    title!: string;

    @ApiProperty({
        example:
            'Checks email domains, MX records, and disposable mailboxes before signup.',
        minLength: 10,
        maxLength: 2000,
    })
    description!: string;

    @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 10 })
    topKTags?: number;
}
