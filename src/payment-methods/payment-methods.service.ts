import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payment-method.dto';
import { PaymentMethod } from './payment-method.entity';

@Injectable()
export class PaymentMethodsService {
  constructor(@InjectRepository(PaymentMethod) private readonly repo: Repository<PaymentMethod>) {}

  /** Активные способы оплаты; с currency — только те, что принимают эту валюту */
  async findActive(currency?: string) {
    const list = await this.repo.find({ where: { isActive: true }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    return currency ? list.filter((pm) => this.accepts(pm, currency)) : list;
  }

  accepts(pm: PaymentMethod, currency: string) {
    return pm.currencies.length === 0 || pm.currencies.includes(currency.toUpperCase());
  }

  findAll() {
    return this.repo.find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async getById(id: string) {
    const pm = await this.repo.findOne({ where: { id } });
    if (!pm) throw new NotFoundException('Способ оплаты не найден');
    return pm;
  }

  async getActiveById(id: string) {
    const pm = await this.repo.findOne({ where: { id, isActive: true } });
    if (!pm) throw new NotFoundException('Способ оплаты не найден или отключён');
    return pm;
  }

  create(dto: CreatePaymentMethodDto) {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdatePaymentMethodDto) {
    const pm = await this.getById(id);
    return this.repo.save({ ...pm, ...dto });
  }

  async remove(id: string) {
    await this.getById(id);
    try {
      await this.repo.delete(id);
    } catch (e: any) {
      if (e?.code === '23503') throw new ConflictException('Есть заказы с этим способом оплаты — отключите его');
      throw e;
    }
    return { success: true };
  }
}
