import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrenciesService } from '../currencies/currencies.service';
import { assertValidFieldSchema } from '../games/fields.util';
import { Game } from '../games/game.entity';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { Product } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
    @InjectRepository(Game) private readonly games: Repository<Game>,
    private readonly currencies: CurrenciesService,
  ) {}

  async getById(id: string) {
    const product = await this.repo.findOne({ where: { id }, relations: { game: true } });
    if (!product) throw new NotFoundException('Товар не найден');
    return this.withLocalPrices(product);
  }

  async findByGame(gameId: string) {
    const list = await this.repo.find({ where: { gameId }, order: { sortOrder: 'ASC', price: 'ASC' } });
    return Promise.all(list.map((p) => this.withLocalPrices(p)));
  }

  async create(dto: CreateProductDto) {
    if (!(await this.games.exist({ where: { id: dto.gameId } }))) {
      throw new NotFoundException('Игра не найдена');
    }
    await this.validate(dto);
    const saved = await this.repo.save(this.repo.create(dto));
    return this.getById(saved.id);
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.repo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Товар не найден');
    const merged = { ...product, ...dto };
    await this.validate(merged);
    await this.repo.save(merged);
    return this.getById(id);
  }

  async remove(id: string) {
    await this.getById(id);
    try {
      await this.repo.delete(id);
    } catch (e: any) {
      if (e?.code === '23503') {
        throw new ConflictException('По товару есть заказы — его нельзя удалить, только скрыть (isActive=false)');
      }
      throw e;
    }
    return { success: true };
  }

  /** Для админки: сколько товар стоит в каждой активной валюте (и ручная ли это цена) */
  private async withLocalPrices(p: Product) {
    const currencies = await this.currencies.active();
    return { ...p, localPrices: currencies.map((c) => this.currencies.priceIn(p, c)) };
  }

  private async validate(p: Pick<CreateProductDto, 'fields' | 'price' | 'oldPrice' | 'prices'>) {
    if (p.fields) assertValidFieldSchema(p.fields);
    if (p.oldPrice != null && p.price != null && p.oldPrice <= p.price) {
      throw new BadRequestException('oldPrice должна быть больше price');
    }
    await this.currencies.assertValidPrices(p.prices ?? null);
  }
}
