import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { resolve } from 'path';
import { Observable, Subject } from 'rxjs';
import { In, Repository } from 'typeorm';
import { AuthAdmin } from '../common/decorators';
import { Paginated } from '../common/dto/pagination.dto';
import { AdminRole, FieldType, OrderStatus, ProductType, REJECT_REASON_TEXT } from '../common/enums';
import { RECEIPTS_DIR } from '../common/utils/upload';
import { CurrenciesService } from '../currencies/currencies.service';
import { validatePlayerData } from '../games/fields.util';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { Product } from '../products/product.entity';
import {
  CompleteOrderDto,
  CreateOrderDto,
  OrdersQueryDto,
  RejectOrderDto,
  SubmitPaymentDto,
} from './dto/order.dto';
import { Order } from './order.entity';

export interface OrderEvent {
  type: 'order.created' | 'order.paid' | 'order.updated';
  orderId: string;
  number: number;
  status: OrderStatus;
}

/** Из каких статусов админ может завершить/отклонить заказ */
const REVIEWABLE = [OrderStatus.PENDING_REVIEW, OrderStatus.IN_PROGRESS];

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersService.name);
  private readonly events$ = new Subject<OrderEvent>();
  private expireTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Order) private readonly repo: Repository<Order>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly currencies: CurrenciesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // раз в минуту отменяем заказы, по которым не прислали чек
    this.expireTimer = setInterval(() => this.expireUnpaid().catch((e) => this.logger.error(e)), 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.expireTimer);
    this.events$.complete();
  }

  /** Поток событий для админки (SSE) */
  get events(): Observable<OrderEvent> {
    return this.events$.asObservable();
  }

  // ======================= КЛИЕНТ =======================

  /** Шаг 1: выбран товар, заполнены данные игрока и Telegram */
  async create(dto: CreateOrderDto, country: string | null) {
    const product = await this.products.findOne({ where: { id: dto.productId }, relations: { game: true } });
    if (!product || !product.isActive || !product.game.isActive) {
      throw new NotFoundException('Товар не найден или недоступен');
    }

    const fields = product.fields ?? product.game.fields;
    const playerData = validatePlayerData(fields, dto.playerData);

    // цену считаем на сервере — клиенту не доверяем
    const currency = await this.currencies.resolve(dto.currency, country);
    const local = this.currencies.priceIn(product, currency);

    const order = await this.repo.save(
      this.repo.create({
        status: OrderStatus.AWAITING_PAYMENT,
        gameId: product.gameId,
        productId: product.id,
        gameName: product.game.name,
        productName: product.name,
        productType: product.type,
        amount: product.amount,
        bonusAmount: product.bonusAmount,
        currency: currency.code,
        price: local.price,
        basePrice: product.price,
        playerData,
        fieldsSnapshot: fields,
        telegramUsername: dto.telegramUsername,
      }),
    );
    this.emit('order.created', order);
    return this.getPublic(order.id);
  }

  /** Шаг 2: клиент оплатил по QR и прислал чек */
  async submitPayment(id: string, dto: SubmitPaymentDto, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Прикрепите скриншот чека');
    try {
      const pm = await this.paymentMethods.getActiveById(dto.paymentMethodId);
      const current = await this.repo.findOne({ where: { id }, select: ['id', 'currency'] });
      if (current && !this.paymentMethods.accepts(pm, current.currency)) {
        throw new BadRequestException(`Этот способ оплаты не принимает ${current.currency}`);
      }

      const res = await this.repo
        .createQueryBuilder()
        .update(Order)
        .set({
          status: OrderStatus.PENDING_REVIEW,
          paymentMethodId: dto.paymentMethodId,
          paidAmount: dto.paidAmount,
          receiptFile: file.filename,
          paidAt: () => 'now()',
        })
        .where('id = :id AND status = :status', { id, status: OrderStatus.AWAITING_PAYMENT })
        .execute();

      if (!res.affected) {
        const exists = await this.repo.exist({ where: { id } });
        if (!exists) throw new NotFoundException('Заказ не найден');
        throw new ConflictException('Чек по этому заказу уже отправлен или заказ закрыт');
      }
    } catch (e) {
      await this.deleteReceipt(file.filename);
      throw e;
    }

    const order = await this.getPublic(id);
    this.emit('order.paid', order);
    return order;
  }

  async cancelByCustomer(id: string) {
    const res = await this.repo.update(
      { id, status: OrderStatus.AWAITING_PAYMENT },
      { status: OrderStatus.CANCELLED, customerMessage: 'Заказ отменён клиентом', processedAt: new Date() },
    );
    if (!res.affected) throw new ConflictException('Заказ нельзя отменить (он уже оплачен или закрыт)');
    return this.getPublic(id);
  }

  /** Что видит клиент на странице статуса заказа */
  async getPublic(id: string) {
    const o = await this.repo
      .createQueryBuilder('o')
      .addSelect('o.telegramChatId')
      .where('o.id = :id', { id })
      .getOne();
    if (!o) throw new NotFoundException('Заказ не найден');
    const bot = this.config.get<string>('TELEGRAM_BOT_USERNAME')?.replace(/^@/, '');

    // пароли и прочие секретные поля клиенту обратно не отдаём
    const hidden = new Set(o.fieldsSnapshot.filter((f) => f.type === FieldType.PASSWORD).map((f) => f.key));
    const playerData = Object.fromEntries(Object.entries(o.playerData).filter(([k]) => !hidden.has(k)));

    return {
      id: o.id,
      number: o.number,
      status: o.status,
      gameName: o.gameName,
      productName: o.productName,
      productType: o.productType,
      amount: o.amount,
      bonusAmount: o.bonusAmount,
      currency: o.currency,
      price: o.price,
      paidAmount: o.paidAmount,
      playerData,
      fields: o.fieldsSnapshot.filter((f) => !hidden.has(f.key)).map(({ key, label }) => ({ key, label })),
      telegramUsername: o.telegramUsername,
      /** Кнопка «Получать уведомления в Telegram» (deep link, payload ≤ 64 символа) */
      telegramBotLink:
        bot && this.config.get('TELEGRAM_BOT_TOKEN') ? `https://t.me/${bot}?start=o_${o.id.replace(/-/g, '')}` : null,
      telegramLinked: !!o.telegramChatId,
      rejectReason: o.rejectReason,
      rejectReasonText: o.rejectReason ? REJECT_REASON_TEXT[o.rejectReason] : null,
      customerMessage: o.customerMessage,
      deliveredData: o.status === OrderStatus.COMPLETED ? o.deliveredData : null,
      paymentDeadline:
        o.status === OrderStatus.AWAITING_PAYMENT
          ? new Date(o.createdAt.getTime() + this.paymentTimeoutMs())
          : null,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      processedAt: o.processedAt,
    };
  }

  // ======================= АДМИН =======================

  async list(q: OrdersQueryDto, me: AuthAdmin): Promise<Paginated<Order>> {
    const qb = this.repo
      .createQueryBuilder('o')
      .leftJoin('o.assignedAdmin', 'a')
      .addSelect(['a.id', 'a.name'])
      .leftJoin('o.paymentMethod', 'pm')
      .addSelect(['pm.id', 'pm.name']);

    if (q.status?.length) qb.andWhere('"o"."status" IN (:...status)', { status: q.status });
    if (q.gameId) qb.andWhere('"o"."gameId" = :gameId', { gameId: q.gameId });
    if (q.currency) qb.andWhere('"o"."currency" = :currency', { currency: q.currency });
    if (q.mine) qb.andWhere('"o"."assignedAdminId" = :me', { me: me.id });
    if (q.from) qb.andWhere('"o"."createdAt" >= :from::date', { from: q.from });
    if (q.to) qb.andWhere(`"o"."createdAt" < (:to::date + interval '1 day')`, { to: q.to });
    if (q.search) {
      const s = q.search.replace(/^[#@]/, '');
      const params = { like: `%${s.replace(/[%_\\]/g, '\\$&')}%`, num: /^\d{1,9}$/.test(s) ? Number(s) : -1 };
      qb.andWhere(
        '("o"."number" = :num OR "o"."telegramUsername" ILIKE :like OR "o"."playerData"::text ILIKE :like)',
        params,
      );
    }

    // Ждущие проверки — сверху, самые старые первыми (очередь); остальные — новые первыми.
    // Джойны только ManyToOne, поэтому offset/limit безопасны (строки не размножаются).
    const active = `"o"."status" IN ('${OrderStatus.PENDING_REVIEW}','${OrderStatus.IN_PROGRESS}')`;
    qb.orderBy(`CASE WHEN ${active} THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy(`CASE WHEN ${active} THEN "o"."createdAt" END`, 'ASC')
      .addOrderBy('"o"."createdAt"', 'DESC')
      .offset((q.page - 1) * q.limit)
      .limit(q.limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: q.page, limit: q.limit };
  }

  async getForAdmin(id: string) {
    const order = await this.repo
      .createQueryBuilder('o')
      .addSelect('o.receiptFile')
      .leftJoinAndSelect('o.paymentMethod', 'pm')
      .leftJoin('o.assignedAdmin', 'a')
      .addSelect(['a.id', 'a.name', 'a.phone'])
      .where('o.id = :id', { id })
      .getOne();
    if (!order) throw new NotFoundException('Заказ не найден');

    const { receiptFile, ...rest } = order;
    return {
      ...rest,
      hasReceipt: !!receiptFile,
      amountMatches: order.paidAmount === null ? null : order.paidAmount === order.price,
    };
  }

  async getReceiptPath(id: string) {
    const order = await this.repo
      .createQueryBuilder('o')
      .addSelect('o.receiptFile')
      .where('o.id = :id', { id })
      .getOne();
    if (!order?.receiptFile) throw new NotFoundException('Чек не найден');
    const path = resolve(RECEIPTS_DIR, order.receiptFile);
    if (!path.startsWith(RECEIPTS_DIR) || !existsSync(path)) throw new NotFoundException('Файл чека не найден');
    return path;
  }

  /** Взять заказ в работу — чтобы два админа не делали одно и то же */
  async take(id: string, me: AuthAdmin) {
    const res = await this.repo.update(
      { id, status: OrderStatus.PENDING_REVIEW },
      { status: OrderStatus.IN_PROGRESS, assignedAdminId: me.id },
    );
    if (!res.affected) await this.throwTransitionError(id, 'взять в работу');
    return this.afterChange(id);
  }

  /** Вернуть заказ в очередь */
  async release(id: string, me: AuthAdmin) {
    const order = await this.getOrThrow(id);
    this.assertCanHandle(order, me);
    const res = await this.repo.update(
      { id, status: OrderStatus.IN_PROGRESS },
      { status: OrderStatus.PENDING_REVIEW, assignedAdminId: null },
    );
    if (!res.affected) await this.throwTransitionError(id, 'вернуть в очередь');
    return this.afterChange(id);
  }

  /** Всё совпало — баланс пополнен / код выдан */
  async complete(id: string, dto: CompleteOrderDto, me: AuthAdmin) {
    const order = await this.getOrThrow(id);
    this.assertCanHandle(order, me);
    if (order.productType === ProductType.VOUCHER && !dto.deliveredData) {
      throw new BadRequestException('Для ваучера укажите код (deliveredData)');
    }

    const res = await this.repo.update(
      { id, status: In(REVIEWABLE) },
      {
        status: OrderStatus.COMPLETED,
        assignedAdminId: me.id,
        processedAt: new Date(),
        rejectReason: null,
        customerMessage:
          dto.customerMessage ||
          (order.productType === ProductType.VOUCHER
            ? 'Оплата подтверждена! Ваш код ваучера готов.'
            : 'Ваш счёт успешно пополнен!'),
        deliveredData: dto.deliveredData ?? null,
        ...(dto.adminNote !== undefined && { adminNote: dto.adminNote }),
      },
    );
    if (!res.affected) await this.throwTransitionError(id, 'завершить');
    return this.afterChange(id);
  }

  /** Что-то не совпало — отказ с причиной */
  async reject(id: string, dto: RejectOrderDto, me: AuthAdmin) {
    const order = await this.getOrThrow(id);
    this.assertCanHandle(order, me);

    const res = await this.repo.update(
      { id, status: In(REVIEWABLE) },
      {
        status: OrderStatus.REJECTED,
        assignedAdminId: me.id,
        processedAt: new Date(),
        rejectReason: dto.reason,
        customerMessage: dto.customerMessage || REJECT_REASON_TEXT[dto.reason],
        ...(dto.adminNote !== undefined && { adminNote: dto.adminNote }),
      },
    );
    if (!res.affected) await this.throwTransitionError(id, 'отклонить');
    return this.afterChange(id);
  }

  async setNote(id: string, adminNote: string) {
    await this.getOrThrow(id);
    await this.repo.update(id, { adminNote });
    return this.getForAdmin(id);
  }

  async stats() {
    const byStatus = await this.repo
      .createQueryBuilder('o')
      .select('"o"."status"', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('"o"."status"')
      .getRawMany<{ status: OrderStatus; count: number }>();

    const day = `"o"."processedAt" >= date_trunc('day', now())`;
    const month = `"o"."processedAt" >= date_trunc('month', now())`;
    // Общая выручка — в базовой валюте (basePrice), чтобы рубли и сумы не складывались
    const revenue = await this.repo
      .createQueryBuilder('o')
      .select(`COALESCE(SUM("o"."basePrice") FILTER (WHERE ${day}), 0)`, 'today')
      .addSelect(`COALESCE(SUM("o"."basePrice") FILTER (WHERE ${month}), 0)`, 'month')
      .addSelect(`(COUNT(*) FILTER (WHERE ${day}))::int`, 'todayCount')
      .where('"o"."status" = :s', { s: OrderStatus.COMPLETED })
      .getRawOne<{ today: string; month: string; todayCount: number }>();

    // Фактически полученные деньги по каждой валюте за месяц
    const byCurrency = await this.repo
      .createQueryBuilder('o')
      .select('"o"."currency"', 'currency')
      .addSelect(`COALESCE(SUM("o"."price") FILTER (WHERE ${day}), 0)`, 'today')
      .addSelect('COALESCE(SUM("o"."price"), 0)', 'month')
      .where('"o"."status" = :s', { s: OrderStatus.COMPLETED })
      .andWhere(month)
      .groupBy('"o"."currency"')
      .getRawMany<{ currency: string; today: string; month: string }>();

    const counts = Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const r of byStatus) counts[r.status] = r.count;

    return {
      counts,
      pendingTotal: counts.PENDING_REVIEW + counts.IN_PROGRESS,
      baseCurrency: (await this.currencies.base()).code,
      revenueToday: Number(revenue?.today ?? 0),
      revenueMonth: Number(revenue?.month ?? 0),
      completedToday: revenue?.todayCount ?? 0,
      revenueByCurrency: byCurrency.map((r) => ({
        currency: r.currency,
        today: Number(r.today),
        month: Number(r.month),
      })),
    };
  }

  // ======================= helpers =======================

  private async expireUnpaid() {
    const res = await this.repo
      .createQueryBuilder()
      .update(Order)
      .set({
        status: OrderStatus.CANCELLED,
        customerMessage: 'Заказ отменён: время на оплату истекло',
        processedAt: () => 'now()',
      })
      .where('status = :s', { s: OrderStatus.AWAITING_PAYMENT })
      .andWhere(`"createdAt" < now() - make_interval(mins => :mins::int)`, {
        mins: Math.round(this.paymentTimeoutMs() / 60_000),
      })
      .returning(['id', 'number', 'status'])
      .execute();
    const rows = (res.raw ?? []) as { id: string; number: number; status: OrderStatus }[];
    if (rows.length) this.logger.log(`Отменено неоплаченных заказов: ${rows.length}`);
    for (const r of rows) this.emit('order.updated', r);
  }

  private paymentTimeoutMs() {
    return Number(this.config.get('ORDER_PAYMENT_TIMEOUT_MIN') ?? 60) * 60_000;
  }

  private async getOrThrow(id: string) {
    const order = await this.repo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Заказ не найден');
    return order;
  }

  /** Заказ, взятый другим админом, может закрыть только он сам или суперадмин */
  private assertCanHandle(order: Order, me: AuthAdmin) {
    if (
      order.status === OrderStatus.IN_PROGRESS &&
      order.assignedAdminId &&
      order.assignedAdminId !== me.id &&
      me.role !== AdminRole.SUPERADMIN
    ) {
      throw new ForbiddenException('Заказ уже в работе у другого админа');
    }
  }

  private async throwTransitionError(id: string, action: string): Promise<never> {
    const order = await this.getOrThrow(id);
    throw new ConflictException(`Нельзя ${action} заказ в статусе ${order.status}`);
  }

  private async afterChange(id: string) {
    const order = await this.getForAdmin(id);
    this.emit('order.updated', order);
    return order;
  }

  private emit(type: OrderEvent['type'], o: { id: string; number: number; status: OrderStatus }) {
    this.events$.next({ type, orderId: o.id, number: o.number, status: o.status });
  }

  private async deleteReceipt(filename: string) {
    await unlink(resolve(RECEIPTS_DIR, filename)).catch(() => undefined);
  }
}
