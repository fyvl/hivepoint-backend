import { ApiProperty } from '@nestjs/swagger';
import { VersionDto } from './version.dto';

export class VersionListResponseDto {
    @ApiProperty({ type: [VersionDto] })
    items!: VersionDto[];
}
