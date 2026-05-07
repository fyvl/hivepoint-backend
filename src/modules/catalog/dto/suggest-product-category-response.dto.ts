import { ApiProperty } from '@nestjs/swagger';

class TagSuggestionDto {
    @ApiProperty({ example: 'email-validation' })
    tag!: string;

    @ApiProperty({ example: 0.82 })
    score!: number;
}

export class SuggestProductCategoryResponseDto {
    @ApiProperty({ example: 'data_validation' })
    category!: string;

    @ApiProperty({ example: 0.74 })
    categoryScore!: number;

    @ApiProperty({ type: [TagSuggestionDto] })
    tags!: TagSuggestionDto[];

    @ApiProperty({ example: 'embeddings' })
    method!: string;

    @ApiProperty({ example: 'paraphrase-multilingual-MiniLM-L12-v2' })
    model!: string;
}
