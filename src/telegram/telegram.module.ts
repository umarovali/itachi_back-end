import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/order.entity';
import { OrdersModule } from '../orders/orders.module';
import { TelegramChat } from './telegram-chat.entity';
import { TelegramService } from './telegram.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, TelegramChat]), OrdersModule],
  providers: [TelegramService],
})
export class TelegramModule {}
