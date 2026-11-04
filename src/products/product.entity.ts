import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductType } from '../common/enums';
import { decimalTransformer } from '../common/utils/decimal.transformer';
import { GameField } from '../games/dto/game-field.dto';
import { Game } from '../games/game.entity';

/** Товар/пакет игры: "110 алмазов — 84 ₽", "Ваучер 520 алмазов", "Недельный пропуск" */
@Entity('products')
@Index(['gameId', 'isActive'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  gameId: string;

  @ManyToOne(() => Game, (g) => g.products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gameId' })
  game: Game;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'enum', enum: ProductType, default: ProductType.CURRENCY })
  type: ProductType;

  /** Сколько валюты (110). Для подписок/ваучеров без количества — null */
  @Column({ type: 'int', nullable: true })
  amount: number | null;

  /** Бонус сверху (+11) */
  @Column({ type: 'int', default: 0 })
  bonusAmount: number;

  /** Цена в БАЗОВОЙ валюте (по умолчанию RUB) */
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: decimalTransformer })
  price: number;

  /** Зачёркнутая "старая" цена для скидки (в базовой валюте) */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  oldPrice: number | null;

  /**
   * Ручные цены в других валютах: { "UZS": { "price": 13000, "oldPrice": 15000 } }.
   * Если валюты здесь нет — цена считается из price по курсу валюты.
   */
  @Column({ type: 'jsonb', nullable: true })
  prices: Record<string, { price: number; oldPrice?: number | null }> | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  /**
   * Переопределение формы заказа для этого товара.
   * null — используются поля игры. [] — клиент ничего кроме Telegram не вводит (напр. ваучер).
   */
  @Column({ type: 'jsonb', nullable: true })
  fields: GameField[] | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
