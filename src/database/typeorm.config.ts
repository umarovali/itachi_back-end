import { DataSourceOptions } from 'typeorm';
import { Admin } from '../admins/admin.entity';
import { Currency } from '../currencies/currency.entity';
import { Game } from '../games/game.entity';
import { Order } from '../orders/order.entity';
import { PaymentMethod } from '../payment-methods/payment-method.entity';
import { TelegramChat } from '../telegram/telegram-chat.entity';
import { Product } from '../products/product.entity';

export const ENTITIES = [Admin, Currency, Game, Product, PaymentMethod, Order, TelegramChat];

export function buildTypeOrmOptions(env: Record<string, string | undefined>): DataSourceOptions {
  // Хостинги (Render, Railway, Neon) отдают подключение одной строкой DATABASE_URL
  const connection = env.DATABASE_URL
    ? { url: env.DATABASE_URL }
    : {
        host: env.DB_HOST ?? 'localhost',
        port: Number(env.DB_PORT ?? 5432),
        username: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
      };
  return {
    type: 'postgres',
    ...connection,
    // внешние подключения к облачным БД требуют SSL; внутренняя сеть Render — нет
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    synchronize: env.DB_SYNC === 'true',
    migrationsRun: env.DB_SYNC !== 'true',
    logging: env.DB_LOGGING === 'true',
  };
}
