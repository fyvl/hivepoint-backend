import { Module } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
    imports: [PrismaModule],
    controllers: [UsersController],
    providers: [UsersService, JwtGuard],
})
export class UsersModule {}
