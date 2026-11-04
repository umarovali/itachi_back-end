import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrenciesService } from '../currencies/currencies.service';
import { CreateGameDto, UpdateGameDto } from './dto/game.dto';
import { assertValidFieldSchema } from './fields.util';
import { Game } from './game.entity';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game) private readonly repo: Repository<Game>,
    private readonly currencies: CurrenciesService,
  ) {}

  // ---------- публичное ----------

  findActive() {
    return this.repo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
      select: ['id', 'slug', 'name', 'imageUrl', 'currencyName', 'currencyIconUrl', 'sortOrder'],
    });
  }

  /** Страница игры: игра + активные товары (цены в валюте клиента) + поля формы */
  async findActiveBySlug(slug: string, currencyCode?: string, country?: string | null) {
    const game = await this.repo
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.products', 'p', 'p.isActive = true')
      .where('g.slug = :slug AND g.isActive = true', { slug })
      .orderBy('p.sortOrder', 'ASC')
      .addOrderBy('p.price', 'ASC')
      .getOne();
    if (!game) throw new NotFoundException('Игра не найдена');

    const cur = await this.currencies.resolve(currencyCode, country);
    return {
      ...game,
      currency: { code: cur.code, symbol: cur.symbol, name: cur.name },
      products: game.products.map(({ prices: _manual, price, oldPrice, ...p }) => {
        const local = this.currencies.priceIn({ price, oldPrice, prices: _manual }, cur);
        return { ...p, price: local.price, oldPrice: local.oldPrice, currency: cur.code };
      }),
    };
  }

  // ---------- админка ----------

  findAll() {
    return this.repo.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async getById(id: string) {
    const game = await this.repo.findOne({
      where: { id },
      relations: { products: true },
      order: { products: { sortOrder: 'ASC', price: 'ASC' } },
    });
    if (!game) throw new NotFoundException('Игра не найдена');
    return game;
  }

  async create(dto: CreateGameDto) {
    assertValidFieldSchema(dto.fields);
    await this.ensureSlugFree(dto.slug);
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateGameDto) {
    const game = await this.getById(id);
    if (dto.fields) assertValidFieldSchema(dto.fields);
    if (dto.slug && dto.slug !== game.slug) await this.ensureSlugFree(dto.slug);
    const { products: _p, ...rest } = game;
    await this.repo.save({ ...rest, ...dto });
    return this.getById(id);
  }

  /** Удаляем только если нет заказов; иначе предлагаем скрыть (isActive=false) */
  async remove(id: string) {
    await this.getById(id);
    try {
      await this.repo.delete(id);
    } catch (e: any) {
      if (e?.code === '23503') {
        throw new ConflictException('По игре есть заказы — её нельзя удалить, только скрыть (isActive=false)');
      }
      throw e;
    }
    return { success: true };
  }

  private async ensureSlugFree(slug: string) {
    if (await this.repo.exist({ where: { slug } })) throw new ConflictException('Slug уже занят');
  }
}
