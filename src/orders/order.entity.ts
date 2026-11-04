import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Admin } from '../admins/admin.entity';
import { OrderStatus, ProductType, RejectReason } from '../common/enums';
import { decimalTransformer } from '../common/utils/decimal.transformer';
import { GameField } from '../games/dto/game-field.dto';
import { Game } from '../games/game.entity';
import { PaymentMethod } from '../payment-methods/payment-method.entity';
import { Product } from '../products/product.entity';

@Entity('orders')
@Index(['status', 'createdAt'])
export class Order {
  /** Секретный id — по нему клиент смотрит статус своего заказа */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Человекочитаемый номер заказа: #1024 */
  @Column({ unique: true })
  @Generated('increment')
  number: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.AWAITING_PAYMENT })
  status: OrderStatus;

  // ---------- что купили (+ снапшот на момент покупки: цена/название могут потом измениться) ----------

  @Column('uuid')
  gameId: string;

  @ManyToOne(() => Game, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'gameId' })
  game: Game;

  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ length: 150 })
  gameName: string;

  @Column({ length: 150 })
  productName: string;

  @Column({ type: 'enum', enum: ProductType })
  productType: ProductType;

  @Column({ type: 'int', nullable: true })
  amount: number | null;

  @Column({ type: 'int', default: 0 })
  bonusAmount: number;

  /** Валюта заказа (ISO 4217) — в ней клиент платит */
  @Column({ length: 3, default: 'RUB' })
  currency: string;

  /** Цена к оплате в валюте заказа */
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: decimalTransformer })
  price: number;

  /** Цена в базовой валюте на момент заказа — для общей выручки */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: decimalTransformer })
  basePrice: number;

  // ---------- данные клиента ----------

  /** Значения формы: { playerId: "123456", server: "asia" } */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  playerData: Record<string, string>;

  /** Снапшот схемы полей — чтобы админ видел подписи, даже если форму игры поменяли */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  fieldsSnapshot: GameField[];

  /** Telegram без @ */
  @Index()
  @Column({ length: 32 })
  telegramUsername: string;

  /** chat_id клиента, если он открыл бота по ссылке из заказа */
  @Column({ type: 'bigint', nullable: true, select: false })
  telegramChatId: string | null;

  // ---------- оплата ----------

  @Column({ type: 'uuid', nullable: true })
  paymentMethodId: string | null;

  @ManyToOne(() => PaymentMethod, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethod | null;

  /** Сумма, которую клиент указал как оплаченную */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  paidAmount: number | null;

  /** Имя файла чека в UPLOAD_DIR/receipts (не публичный) */
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  receiptFile: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  // ---------- обработка админом ----------

  @Column({ type: 'uuid', nullable: true })
  assignedAdminId: string | null;

  @ManyToOne(() => Admin, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignedAdminId' })
  assignedAdmin: Admin | null;

  @Column({ type: 'enum', enum: RejectReason, nullable: true })
  rejectReason: RejectReason | null;

  /** Сообщение клиенту (причина отказа или комментарий к выполнению) */
  @Column({ type: 'text', nullable: true })
  customerMessage: string | null;

  /** Для ваучеров: код, который увидит клиент */
  @Column({ type: 'text', nullable: true })
  deliveredData: string | null;

  /** Внутренняя заметка, клиенту не показывается */
  @Column({ type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
