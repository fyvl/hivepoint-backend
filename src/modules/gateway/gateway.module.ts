import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { UsageModule } from '../usage/usage.module';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

@Module({
    imports: [PrismaModule, UsageModule],
    controllers: [GatewayController],
    providers: [GatewayService],
})
export class GatewayModule {}
