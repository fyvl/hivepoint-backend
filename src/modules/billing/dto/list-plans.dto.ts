import { ApiProperty } from '@nestjs/swagger';
import { PlanDto } from './plan.dto';

export class PlanListResponseDto {
    @ApiProperty({ type: [PlanDto] })
    items!: PlanDto[];
}
