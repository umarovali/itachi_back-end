import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'fs/promises';
import { extname, resolve } from 'path';
import { Subscription } from 'rxjs';
import { Repository } from 'typeorm';
import { FieldType, OrderStatus, ProductType, REJECT_REASON_TEXT } from '../common/enums';
import { RECEIPTS_DIR } from '../common/utils/upload';
import { Order } from '../orders/order.entity';
import { OrderEvent, OrdersService } from '../orders/orders.service';
import { TelegramChat } from './telegram-chat.entity';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n: number | null, cur: string) =>
  n == null ? '—' : `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${cur}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** /start o_<uuid без дефисов> */
const START_ORDER_RE = /^\/start(?:@\w+)?\s+o_([0-9a-f]{32})$/i;

interface TgMessage {
  message_id: number;
  text?: string;
  chat: { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' };
  from?: { id: number; username?: string; first_name?: string };
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}
type Button = { text: string; url: string };

/**
 * Telegram-бот без сторонних библиотек (Bot API через fetch, long polling).
 * - клиентам: статус заказа (чек получен / выполнен / отклонён / отменён);
 * - админам (группа TELEGRAM_ADMIN_CHAT_ID): новый оплаченный заказ + фото чека.
 * Без TELEGRAM_BOT_TOKEN модуль просто выключен.
 */
@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
  private readonly apiBase = (this.config.get<string>('TELEGRAM_API_URL') || 'https://api.telegram.org').replace(/\/$/, '');
  private readonly adminChatId = this.config.get<string>('TELEGRAM_ADMIN_CHAT_ID') || null;
  private readonly adminPanelUrl = this.config.get<string>('ADMIN_PANEL_URL') || '';
  private readonly sitePublicUrl = this.config.get<string>('SITE_URL') || '';

  private offset = 0;
  private stopped = false;
  private readonly abort = new AbortController();
  private sub?: Subscription;

  constructor(
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(TelegramChat) private readonly chats: Repository<TelegramChat>,
  ) {}

  get enabled() {
    return !!this.token;
  }

  async onApplicationBootstrap() {
    if (!this.enabled) {
      this.logger.log('TELEGRAM_BOT_TOKEN не задан — бот выключен');
      return;
    }
    this.sub = this.orders.events.subscribe((e) =>
      this.onOrderEvent(e).catch((err) => this.logger.warn(`Уведомление по заказу #${e.number}: ${err.message}`)),
    );
    try {
      const me = await this.api<{ username: string }>('getMe');
      const configured = this.config.get<string>('TELEGRAM_BOT_USERNAME')?.replace(/^@/, '');
      if (configured?.toLowerCase() !== me.username.toLowerCase()) {
        this.logger.warn(`TELEGRAM_BOT_USERNAME=${configured ?? '(пусто)'}, а у бота @${me.username} — исправьте .env`);
      }
      // long polling не работает, если у бота включён webhook
      await this.api('deleteWebhook', { drop_pending_updates: false });
      this.logger.log(`Бот @${me.username} запущен`);
    } catch (e: any) {
      this.logger.error(`Бот не запустился: ${e.message}`);
      return;
    }
    void this.pollLoop();
  }

  onModuleDestroy() {
    this.stopped = true;
    this.abort.abort();
    this.sub?.unsubscribe();
  }

  // ======================= входящие сообщения =======================

  private async pollLoop() {
    while (!this.stopped) {
      try {
        const updates = await this.api<TgUpdate[]>(
          'getUpdates',
          { offset: this.offset, timeout: 25, allowed_updates: ['message'] },
          35_000,
        );
        for (const u of updates) {
          this.offset = u.update_id + 1;
          if (u.message) await this.handleMessage(u.message).catch((e) => this.logger.warn(`Сообщение: ${e.message}`));
        }
      } catch (e: any) {
        if (this.stopped) break;
        this.logger.warn(`getUpdates: ${e.message}`);
        await sleep(5_000);
      }
    }
  }

  private async handleMessage(msg: TgMessage) {
    const text = msg.text?.trim() ?? '';
    const chatId = String(msg.chat.id);

    // в любом чате: узнать chat_id (нужно для TELEGRAM_ADMIN_CHAT_ID)
    if (/^\/chatid(@\w+)?$/i.test(text)) {
      return this.send(chatId, `chat_id этого чата: <code>${esc(chatId)}</code>`);
    }
    if (msg.chat.type !== 'private') return; // в группах больше ничего не делаем

    await this.chats.save({
      chatId,
      username: msg.from?.username?.toLowerCase() ?? null,
      firstName: msg.from?.first_name?.slice(0, 100) ?? null,
      isBlocked: false,
    });

    const m = START_ORDER_RE.exec(text);
    if (m) return this.linkOrder(m[1], chatId);

    return this.send(
      chatId,
      '👋 Здравствуйте! Я присылаю уведомления о ваших заказах.\n\n' +
        'Чтобы подписаться на заказ, нажмите кнопку <b>«Получать уведомления в Telegram»</b> на странице заказа.\n' +
        'Следующие заказы с вашим ником будут приходить сюда автоматически.',
    );
  }

  private async linkOrder(hex: string, chatId: string) {
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const res = await this.orderRepo.update({ id }, { telegramChatId: chatId });
    if (!res.affected) return this.send(chatId, '❓ Заказ не найден. Проверьте ссылку.');
    const order = await this.loadOrder(id);
    if (order) await this.notifyCustomer(order, chatId, true);
  }

  // ======================= события заказов =======================

  private async onOrderEvent(e: OrderEvent) {
    const order = await this.loadOrder(e.orderId);
    if (!order) return;

    const notifyCustomer =
      e.type === 'order.paid' ||
      (e.type === 'order.updated' &&
        [OrderStatus.COMPLETED, OrderStatus.REJECTED, OrderStatus.CANCELLED].includes(order.status));
    if (notifyCustomer) await this.notifyCustomer(order);

    if (e.type === 'order.paid' && this.adminChatId) await this.notifyAdmins(order);
  }

  /**
   * Клиенту: в чат, привязанный к заказу по ссылке, иначе — по нику (если человек уже запускал бота).
   * Код ваучера отправляем только в чат, привязанный по ссылке из заказа.
   */
  private async notifyCustomer(order: Order, chatId?: string, justLinked = false) {
    let target = chatId ?? order.telegramChatId;
    const linked = !!target;
    if (!target) {
      const chat = await this.chats.findOne({
        where: { username: order.telegramUsername.toLowerCase(), isBlocked: false },
      });
      target = chat?.chatId ?? null;
    }
    if (!target) return;

    let text = this.customerText(order, linked);
    if (justLinked) text = `🔔 Вы подписаны на уведомления по заказу <b>#${order.number}</b>.\n\n` + text;

    const buttons: Button[] = [];
    const page = this.orderPageUrl(order.id);
    if (page) buttons.push({ text: 'Открыть заказ', url: page });

    try {
      await this.send(target, text, buttons);
    } catch (e: any) {
      if (/blocked|deactivated|chat not found/i.test(e.message)) {
        await this.chats.update({ chatId: target }, { isBlocked: true });
      }
      throw e;
    }
  }

  private customerText(o: Order, linked: boolean) {
    const head = `<b>#${o.number}</b> · ${esc(o.gameName)} — ${esc(o.productName)}`;
    switch (o.status) {
      case OrderStatus.AWAITING_PAYMENT:
        return `🧾 ${head}\nОжидаем оплату: <b>${money(o.price, o.currency)}</b>.\nПосле оплаты прикрепите чек на странице заказа.`;
      case OrderStatus.PENDING_REVIEW:
      case OrderStatus.IN_PROGRESS:
        return `⏳ ${head}\nЧек получен, проверяем оплату. Сообщим, как только всё будет готово.`;
      case OrderStatus.COMPLETED: {
        let t = `✅ ${head}\n${esc(o.customerMessage || 'Заказ выполнен!')}`;
        if (o.productType === ProductType.VOUCHER && o.deliveredData) {
          t += linked
            ? `\n\nВаш код:\n<code>${esc(o.deliveredData)}</code>`
            : '\n\nКод доступен на странице заказа.';
        }
        return t;
      }
      case OrderStatus.REJECTED: {
        const reason = o.rejectReason ? REJECT_REASON_TEXT[o.rejectReason] : '';
        const extra = o.customerMessage && o.customerMessage !== reason ? `\n${esc(o.customerMessage)}` : '';
        return `❌ ${head}\nЗаказ отклонён.\nПричина: <b>${esc(reason)}</b>${extra}\n\nЕсли это ошибка — напишите в поддержку, указав номер заказа.`;
      }
      case OrderStatus.CANCELLED:
        return `🚫 ${head}\n${esc(o.customerMessage || 'Заказ отменён.')}`;
    }
  }

  /** В админ-группу: новый оплаченный заказ + чек */
  private async notifyAdmins(o: Order) {
    const matches = o.paidAmount === o.price;
    const player = o.fieldsSnapshot
      .map((f) => {
        const v = o.playerData[f.key];
        if (!v) return null;
        // пароли в общий чат не отправляем
        return `• ${esc(f.label)}: ${f.type === FieldType.PASSWORD ? '<i>скрыто, см. админку</i>' : `<code>${esc(v)}</code>`}`;
      })
      .filter(Boolean)
      .join('\n');

    const text =
      `🆕 <b>Заказ #${o.number}</b> ждёт проверки\n\n` +
      `🎮 ${esc(o.gameName)} — ${esc(o.productName)}\n` +
      `💰 Цена: <b>${money(o.price, o.currency)}</b>\n` +
      `💳 Оплачено: <b>${money(o.paidAmount, o.currency)}</b> ${matches ? '✅' : '⚠️ не совпадает'}` +
      (o.paymentMethod ? ` (${esc(o.paymentMethod.name)})` : '') +
      `\n` +
      (player ? `\n${player}\n` : '') +
      `\n✈️ @${esc(o.telegramUsername)}`;

    const buttons: Button[] = [];
    if (/^https:\/\//.test(this.adminPanelUrl)) {
      buttons.push({ text: 'Открыть в админке', url: `${this.adminPanelUrl.replace(/\/$/, '')}/orders/${o.id}` });
    }

    if (!o.receiptFile) return this.send(this.adminChatId!, text, buttons);

    const path = resolve(RECEIPTS_DIR, o.receiptFile);
    const isPdf = extname(path).toLowerCase() === '.pdf';
    try {
      const file = await readFile(path);
      await this.sendFile(this.adminChatId!, isPdf ? 'document' : 'photo', file, o.receiptFile, text, buttons);
    } catch (e: any) {
      this.logger.warn(`Чек не отправлен (${e.message}), отправляю текст`);
      await this.send(this.adminChatId!, text, buttons);
    }
  }

  // ======================= helpers =======================

  private loadOrder(id: string) {
    return this.orderRepo
      .createQueryBuilder('o')
      .addSelect(['o.telegramChatId', 'o.receiptFile'])
      .leftJoinAndSelect('o.paymentMethod', 'pm')
      .where('o.id = :id', { id })
      .getOne();
  }

  private orderPageUrl(id: string) {
    // SITE_URL вида https://site.com/order/{id}; Telegram не принимает http://localhost в кнопках
    if (!/^https:\/\//.test(this.sitePublicUrl)) return null;
    return this.sitePublicUrl.includes('{id}')
      ? this.sitePublicUrl.replace('{id}', id)
      : `${this.sitePublicUrl.replace(/\/$/, '')}/orders/${id}`;
  }

  private keyboard(buttons: Button[]) {
    return buttons.length ? { inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))] } : undefined;
  }

  private send(chatId: string, text: string, buttons: Button[] = []) {
    return this.api('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: this.keyboard(buttons),
    });
  }

  private async sendFile(
    chatId: string,
    kind: 'photo' | 'document',
    file: Buffer,
    filename: string,
    caption: string,
    buttons: Button[],
  ) {
    // подпись к файлу — максимум 1024 символа; если длиннее, текст шлём отдельно
    const fits = caption.length <= 1024;
    if (!fits) await this.send(chatId, caption, buttons);

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append(kind, new Blob([new Uint8Array(file)]), filename);
    if (fits) {
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
      const kb = this.keyboard(buttons);
      if (kb) form.append('reply_markup', JSON.stringify(kb));
    }
    await this.api(kind === 'photo' ? 'sendPhoto' : 'sendDocument', form);
  }

  private async api<T = unknown>(method: string, body?: object | FormData, timeoutMs = 15_000): Promise<T> {
    const isForm = body instanceof FormData;
    const res = await fetch(`${this.apiBase}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body ?? {}),
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(timeoutMs)]),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
    return json.result as T;
  }
}
