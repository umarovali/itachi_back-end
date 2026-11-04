import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../common/utils/decimal.transformer';

/**
 * Валюта витрины. Цены товаров хранятся в базовой валюте (isBase), а для остальных
 * пересчитываются по курсу (rate) с округлением (roundTo) — либо задаются вручную в product.prices.
 */
@Entity('currencies')
export class Currency {
  /** ISO 4217: RUB, UZS, KZT, USD */
  @PrimaryColumn({ length: 3 })
  code: string;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 10 })
  symbol: string;

  /**
   * Итоговый курс, по которому считаются цены: сколько единиц этой валюты за 1 базовую.
   * При autoRate=true пересчитывается сам: marketRate × (1 + markupPercent/100).
   */
  @Column({ type: 'numeric', precision: 18, scale: 6, transformer: decimalTransformer })
  rate: number;

  /** Обновлять курс автоматически по данным ЦБ */
  @Column({ default: false })
  autoRate: boolean;

  /** Наценка к курсу ЦБ, % (покрывает комиссии обмена и скачки курса) */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  markupPercent: number;

  /** Последний курс ЦБ без наценки */
  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true, transformer: decimalTransformer })
  marketRate: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  rateUpdatedAt: Date | null;

  /** Округление вверх до: 1 (₽), 500 (сум), 0.01 ($) */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 1, transformer: decimalTransformer })
  roundTo: number;

  /** Страны (ISO 3166-1 alpha-2), для которых эта валюта выбирается автоматически */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  countries: string[];

  @Column({ default: false })
  isBase: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
