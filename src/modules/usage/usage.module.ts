import { Module } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
    imports: [PrismaModule],
    controllers: [UsageController],
    providers: [UsageService, JwtGuard],
})
export class UsageModule {}
