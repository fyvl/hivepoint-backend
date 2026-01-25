import { Module } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { KeysController } from './keys.controller';
import { KeysService } from './keys.service';

@Module({
    imports: [PrismaModule],
    controllers: [KeysController],
    providers: [KeysService, JwtGuard],
})
export class KeysModule {}
