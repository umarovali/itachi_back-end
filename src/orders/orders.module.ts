import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { Product } from '../products/product.entity';
import { Order } from './order.entity';
import { OrdersAdminController, OrdersPublicController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Product]), PaymentMethodsModule],
  controllers: [OrdersPublicController, OrdersAdminController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
