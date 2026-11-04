import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../products/product.entity';
import { GameField } from './dto/game-field.dto';

@Entity('games')
export class Game {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Для URL: free-fire, pubg-mobile */
  @Column({ unique: true, length: 100 })
  slug: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  /** Название валюты для отображения: "Алмазы", "UC", "Кристаллы сотворения" */
  @Column({ type: 'varchar', length: 100, nullable: true })
  currencyName: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  currencyIconUrl: string | null;

  /** Инструкция для клиента: где найти ID, как активировать ваучер и т.п. */
  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  /**
   * Форма, которую клиент заполняет при покупке (по умолчанию для всех товаров игры).
   * У товара можно переопределить своим набором полей.
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  fields: GameField[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @OneToMany(() => Product, (p) => p.game)
  products: Product[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
