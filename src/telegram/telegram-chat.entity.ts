import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Клиент, который хоть раз нажал «Старт» у бота. Бот не может написать первым,
 * поэтому храним chat_id: следующие заказы с тем же ником будут уведомляться сами.
 */
@Entity('telegram_chats')
export class TelegramChat {
  /** chat_id из Telegram (bigint — храним строкой) */
  @PrimaryColumn({ type: 'bigint' })
  chatId: string;

  /** username в нижнем регистре, без @ */
  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  /** Пользователь заблокировал бота */
  @Column({ default: false })
  isBlocked: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
