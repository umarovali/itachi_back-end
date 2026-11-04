export enum AdminRole {
  SUPERADMIN = 'SUPERADMIN',
  ADMIN = 'ADMIN',
}

/** Тип товара: от него зависит, что админ делает после проверки оплаты */
export enum ProductType {
  /** Пополнение игровой валюты на аккаунт (алмазы, UC, кристаллы...) */
  CURRENCY = 'CURRENCY',
  /** Ваучер / код активации — админ отдаёт клиенту код */
  VOUCHER = 'VOUCHER',
  /** Подписка / пропуск (недельный, месячный, боевой пропуск) */
  SUBSCRIPTION = 'SUBSCRIPTION',
  /** Что-то другое (наборы, предметы) */
  OTHER = 'OTHER',
}

/** Тип поля, которое клиент заполняет при заказе (ID игрока, email, сервер...) */
export enum FieldType {
  TEXT = 'text',
  NUMBER = 'number',
  EMAIL = 'email',
  PHONE = 'phone',
  SELECT = 'select',
  PASSWORD = 'password',
}

export enum OrderStatus {
  /** Заказ создан, клиент ещё не прислал чек */
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  /** Чек прислан, ждёт проверки админом */
  PENDING_REVIEW = 'PENDING_REVIEW',
  /** Админ взял заказ в работу */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Баланс пополнен / код выдан */
  COMPLETED = 'COMPLETED',
  /** Отклонён (с причиной) */
  REJECTED = 'REJECTED',
  /** Отменён клиентом или по таймауту оплаты */
  CANCELLED = 'CANCELLED',
}

export enum RejectReason {
  PAYMENT_NOT_RECEIVED = 'PAYMENT_NOT_RECEIVED',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  INVALID_RECEIPT = 'INVALID_RECEIPT',
  INVALID_PLAYER_DATA = 'INVALID_PLAYER_DATA',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  OTHER = 'OTHER',
}

export const REJECT_REASON_TEXT: Record<RejectReason, string> = {
  [RejectReason.PAYMENT_NOT_RECEIVED]: 'Оплата не поступила',
  [RejectReason.AMOUNT_MISMATCH]: 'Сумма оплаты не совпадает с ценой товара',
  [RejectReason.INVALID_RECEIPT]: 'Чек недействителен или нечитаем',
  [RejectReason.INVALID_PLAYER_DATA]: 'Неверные данные игрока (ID / email / сервер)',
  [RejectReason.OUT_OF_STOCK]: 'Товар временно недоступен',
  [RejectReason.OTHER]: 'Другая причина',
};
