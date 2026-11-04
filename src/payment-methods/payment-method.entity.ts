import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Куда клиент переводит деньги: QR СБП, карта и т.п. */
@Entity('payment_methods')
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** "СБП — Сбербанк" */
  @Column({ length: 100 })
  name: string;

  /** Картинка QR-кода */
  @Column({ type: 'varchar', length: 500, nullable: true })
  qrImageUrl: string | null;

  /** Реквизиты текстом: номер карты/телефона, получатель */
  @Column({ type: 'text', nullable: true })
  details: string | null;

  /** "Отсканируйте QR, введите сумму заказа, сохраните скриншот чека" */
  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  /** В каких валютах принимается: ["RUB"] для СБП, ["UZS"] для Click/Payme. Пусто — любая */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  currencies: string[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
