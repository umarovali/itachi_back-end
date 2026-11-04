import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminsModule } from './admins/admins.module';
import { AuthModule } from './auth/auth.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { buildTypeOrmOptions } from './database/typeorm.config';
import { GamesModule } from './games/games.module';
import { HealthController } from './health.controller';
import { OrdersModule } from './orders/orders.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { ProductsModule } from './products/products.module';
import { TelegramModule } from './telegram/telegram.module';
import { UploadsController } from './uploads/uploads.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => buildTypeOrmOptions(process.env),
    }),
    // секреты передаются явно при sign/verify
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AdminsModule,
    AuthModule,
    CurrenciesModule,
    GamesModule,
    ProductsModule,
    PaymentMethodsModule,
    OrdersModule,
    TelegramModule,
  ],
  controllers: [UploadsController, HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
