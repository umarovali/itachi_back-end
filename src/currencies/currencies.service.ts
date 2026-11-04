import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './currency.entity';
import { CreateCurrencyDto, UpdateCurrencyDto } from './dto/currency.dto';

export interface LocalPrice {
  currency: string;
  price: number;
  oldPrice: number | null;
  /** true — цена задана вручную, false — пересчитана по курсу */
  isManual: boolean;
}

/** То, из чего считается цена (Product) */
export interface Priceable {
  price: number;
  oldPrice: number | null;
  prices: Record<string, { price: number; oldPrice?: number | null }> | null;
}

/** Известные базовые валюты для автосоздания при первом запуске */
const BASE_PRESETS: Record<string, { name: string; symbol: string; countries: string[] }> = {
  RUB: { name: 'Российский рубль', symbol: '₽', countries: ['RU'] },
  UZS: { name: 'Узбекский сум', symbol: 'сум', countries: ['UZ'] },
  KZT: { name: 'Казахстанский тенге', symbol: '₸', countries: ['KZ'] },
  USD: { name: 'Доллар США', symbol: '$', countries: [] },
};

/** Курсы ЦБ РФ в JSON: сколько рублей за Nominal единиц валюты. Бесплатно, без ключа */
const DEFAULT_RATES_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

@Injectable()
export class CurrenciesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CurrenciesService.name);
  /** Таблица маленькая и меняется редко — держим активные валюты в памяти */
  private cache: Currency[] | null = null;
  private syncTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Currency) private readonly repo: Repository<Currency>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    if (!(await this.repo.exist({ where: { isBase: true } }))) {
      const code = (this.config.get<string>('BASE_CURRENCY') || 'RUB').toUpperCase();
      const preset = BASE_PRESETS[code] ?? { name: code, symbol: code, countries: [] };
      await this.repo.save(this.repo.create({ code, ...preset, rate: 1, roundTo: 1, isBase: true }));
      this.logger.log(`Создана базовая валюта ${code}`);
    }

    // курсы: сразу при старте и потом по расписанию (ЦБ обновляет раз в день)
    const everyMin = Number(this.config.get('RATES_SYNC_INTERVAL_MIN') ?? 60);
    const run = () => this.syncRates().catch((e) => this.logger.warn(`Курсы не обновлены: ${e.message}`));
    void run();
    this.syncTimer = setInterval(run, everyMin * 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.syncTimer);
  }

  // ---------- автокурс ----------

  /** Обновить курсы всех валют с autoRate=true. Возвращает, что обновилось */
  async syncRates() {
    const list = await this.repo.find({ where: { autoRate: true } });
    if (!list.length) return { updated: [], failed: [] };

    const base = await this.base();
    const rubPer = await this.fetchRubRates();
    const updated: { code: string; marketRate: number; rate: number }[] = [];
    const failed: string[] = [];

    for (const cur of list) {
      const market = this.marketRate(rubPer, base.code, cur.code);
      if (market === null) {
        failed.push(cur.code);
        continue;
      }
      const rate = this.applyMarkup(market, cur.markupPercent);
      if (cur.rate && Math.abs(rate / cur.rate - 1) > 0.15) {
        this.logger.warn(`Курс ${cur.code} изменился больше чем на 15%: ${cur.rate} → ${rate}`);
      }
      await this.repo.update(cur.code, { marketRate: market, rate, rateUpdatedAt: new Date() });
      updated.push({ code: cur.code, marketRate: market, rate });
    }
    this.cache = null;
    if (failed.length) this.logger.warn(`Нет курса ЦБ для: ${failed.join(', ')}`);
    return { updated, failed };
  }

  /** code → сколько рублей стоит 1 единица */
  private async fetchRubRates(): Promise<Map<string, number>> {
    const url = this.config.get<string>('RATES_SOURCE_URL') || DEFAULT_RATES_URL;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`источник курсов ответил ${res.status}`);
    const json = (await res.json()) as { Valute?: Record<string, { Nominal: number; Value: number }> };
    const map = new Map<string, number>([['RUB', 1]]);
    for (const [code, v] of Object.entries(json.Valute ?? {})) {
      if (v?.Nominal > 0 && v?.Value > 0) map.set(code, v.Value / v.Nominal);
    }
    if (map.size < 2) throw new Error('источник курсов вернул пустой список');
    return map;
  }

  /** Сколько единиц code за 1 единицу base (кросс-курс через рубль) */
  private marketRate(rubPer: Map<string, number>, base: string, code: string): number | null {
    const b = rubPer.get(base);
    const c = rubPer.get(code);
    return b && c ? round6(b / c) : null;
  }

  private applyMarkup(market: number, markupPercent: number) {
    return round6(market * (1 + (markupPercent || 0) / 100));
  }

  /** Для create/update с autoRate: получить курс прямо сейчас */
  private async fetchMarketRateNow(code: string) {
    let rubPer: Map<string, number>;
    try {
      rubPer = await this.fetchRubRates();
    } catch (e: any) {
      throw new BadRequestException(`Не удалось получить курс ЦБ (${e.message}). Укажите курс вручную`);
    }
    const market = this.marketRate(rubPer, (await this.base()).code, code);
    if (market === null) throw new BadRequestException(`У ЦБ нет курса ${code}. Укажите курс вручную`);
    return market;
  }

  // ---------- чтение ----------

  async active(): Promise<Currency[]> {
    if (!this.cache) {
      this.cache = await this.repo.find({ where: { isActive: true }, order: { sortOrder: 'ASC', code: 'ASC' } });
    }
    return this.cache;
  }

  async base(): Promise<Currency> {
    const base = (await this.active()).find((c) => c.isBase) ?? (await this.repo.findOne({ where: { isBase: true } }));
    if (!base) throw new Error('Базовая валюта не настроена');
    return base;
  }

  findAll() {
    return this.repo.find({ order: { sortOrder: 'ASC', code: 'ASC' } });
  }

  /**
   * Какая валюта у клиента:
   * 1) явно выбранная на сайте (?currency=UZS), если активна;
   * 2) по стране из IP (заголовок CDN/nginx);
   * 3) базовая.
   */
  async resolve(requested?: string | null, country?: string | null): Promise<Currency> {
    const list = await this.active();
    if (requested) {
      const c = list.find((x) => x.code === requested.toUpperCase());
      if (c) return c;
    }
    if (country) {
      const c = list.find((x) => x.countries.includes(country.toUpperCase()));
      if (c) return c;
    }
    return this.base();
  }

  /** Цена товара в валюте: ручная (product.prices) или пересчёт по курсу */
  priceIn(p: Priceable, cur: Currency): LocalPrice {
    if (cur.isBase) return { currency: cur.code, price: p.price, oldPrice: p.oldPrice, isManual: true };
    const manual = p.prices?.[cur.code];
    if (manual) {
      return { currency: cur.code, price: manual.price, oldPrice: manual.oldPrice ?? null, isManual: true };
    }
    return {
      currency: cur.code,
      price: this.convert(p.price, cur),
      oldPrice: p.oldPrice == null ? null : this.convert(p.oldPrice, cur),
      isManual: false,
    };
  }

  /** Проверка product.prices: только существующие валюты (не базовая), корректные суммы */
  async assertValidPrices(prices: Priceable['prices']) {
    if (!prices) return;
    if (typeof prices !== 'object' || Array.isArray(prices)) throw new BadRequestException('prices должен быть объектом');
    const all = await this.repo.find();
    for (const [code, v] of Object.entries(prices)) {
      const cur = all.find((c) => c.code === code);
      if (!cur) throw new BadRequestException(`prices: валюта ${code} не найдена`);
      if (cur.isBase) throw new BadRequestException(`prices: цена в базовой валюте ${code} задаётся полем price`);
      const isMoney = (n: unknown) => typeof n === 'number' && n > 0 && Number.isFinite(n) && Math.round(n * 100) === n * 100;
      if (!v || !isMoney(v.price)) throw new BadRequestException(`prices.${code}.price: положительное число, до 2 знаков`);
      if (v.oldPrice != null && (!isMoney(v.oldPrice) || v.oldPrice <= v.price)) {
        throw new BadRequestException(`prices.${code}.oldPrice должна быть больше price`);
      }
    }
  }

  // ---------- админка ----------

  async create(dto: CreateCurrencyDto) {
    if (await this.repo.exist({ where: { code: dto.code } })) throw new ConflictException('Валюта уже существует');
    const entity = this.repo.create({ ...dto, isBase: false });
    if (dto.autoRate) {
      if (dto.rate !== undefined) throw new BadRequestException('При autoRate курс считается сам — не передавайте rate');
      entity.marketRate = await this.fetchMarketRateNow(dto.code);
      entity.rate = this.applyMarkup(entity.marketRate, dto.markupPercent ?? 0);
      entity.rateUpdatedAt = new Date();
    }
    const saved = await this.repo.save(entity);
    this.cache = null;
    return saved;
  }

  async update(code: string, dto: UpdateCurrencyDto) {
    const cur = await this.getOrThrow(code);
    if (cur.isBase) {
      if (dto.rate !== undefined && dto.rate !== 1) throw new BadRequestException('Курс базовой валюты всегда 1');
      if (dto.autoRate) throw new BadRequestException('У базовой валюты нет автокурса');
      if (dto.isActive === false) throw new BadRequestException('Базовую валюту нельзя отключить');
    }

    const next = { ...cur, ...dto };
    if (next.autoRate) {
      if (dto.rate !== undefined) {
        throw new BadRequestException('Включён автокурс — чтобы задать курс вручную, передайте autoRate: false');
      }
      // включили автокурс или поменяли наценку — пересчитываем сразу
      if (!cur.autoRate || next.marketRate == null) {
        next.marketRate = await this.fetchMarketRateNow(cur.code);
        next.rateUpdatedAt = new Date();
      }
      next.rate = this.applyMarkup(next.marketRate!, next.markupPercent);
    } else if (cur.autoRate && dto.rate === undefined) {
      // выключили автокурс без нового курса — оставляем последний посчитанный
      next.rate = cur.rate;
    }

    const saved = await this.repo.save(next);
    this.cache = null;
    return saved;
  }

  async remove(code: string) {
    const cur = await this.getOrThrow(code);
    if (cur.isBase) throw new BadRequestException('Базовую валюту нельзя удалить');
    await this.repo.delete(code);
    this.cache = null;
    return { success: true };
  }

  private async getOrThrow(code: string) {
    const cur = await this.repo.findOne({ where: { code: code.toUpperCase() } });
    if (!cur) throw new NotFoundException('Валюта не найдена');
    return cur;
  }

  private convert(baseAmount: number, cur: Currency) {
    const raw = baseAmount * cur.rate;
    const step = cur.roundTo > 0 ? cur.roundTo : 0.01;
    // округляем вверх до шага; -1e-9 — чтобы 13500.0000001 не стало 14000
    return Number((Math.ceil(raw / step - 1e-9) * step).toFixed(2));
  }
}
