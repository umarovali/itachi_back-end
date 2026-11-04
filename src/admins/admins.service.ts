import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AdminRole } from '../common/enums';
import { normalizePhone } from '../common/utils/phone';
import { Admin } from './admin.entity';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AdminsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminsService.name);

  constructor(
    @InjectRepository(Admin) private readonly repo: Repository<Admin>,
    private readonly config: ConfigService,
  ) {}

  /** Создаём первого суперадмина из .env, если в системе ещё нет ни одного */
  async onApplicationBootstrap() {
    const exists = await this.repo.exist({ where: { role: AdminRole.SUPERADMIN } });
    if (exists) return;
    const phone = this.config.get<string>('SUPERADMIN_PHONE');
    const password = this.config.get<string>('SUPERADMIN_PASSWORD');
    if (!phone || !password) {
      this.logger.warn('Суперадмин не найден, а SUPERADMIN_PHONE/SUPERADMIN_PASSWORD не заданы');
      return;
    }
    await this.create({
      phone: normalizePhone(phone),
      password,
      name: this.config.get('SUPERADMIN_NAME') || 'Super Admin',
      role: AdminRole.SUPERADMIN,
    });
    this.logger.log(`Создан суперадмин ${normalizePhone(phone)}`);
  }

  findAll() {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async getById(id: string) {
    const admin = await this.findById(id);
    if (!admin) throw new NotFoundException('Админ не найден');
    return admin;
  }

  /** Для логина: вместе с хэшем пароля */
  findByPhoneWithSecrets(phone: string) {
    return this.repo
      .createQueryBuilder('a')
      .addSelect(['a.passwordHash', 'a.refreshTokenHash'])
      .where('a.phone = :phone', { phone: normalizePhone(phone) })
      .getOne();
  }

  findByIdWithSecrets(id: string) {
    return this.repo
      .createQueryBuilder('a')
      .addSelect(['a.passwordHash', 'a.refreshTokenHash'])
      .where('a.id = :id', { id })
      .getOne();
  }

  async create(dto: CreateAdminDto) {
    if (await this.repo.exist({ where: { phone: dto.phone } })) {
      throw new ConflictException('Админ с таким телефоном уже существует');
    }
    const admin = this.repo.create({
      phone: dto.phone,
      name: dto.name,
      role: dto.role ?? AdminRole.ADMIN,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
    });
    const saved = await this.repo.save(admin);
    return this.getById(saved.id);
  }

  async update(id: string, dto: UpdateAdminDto, actorId: string) {
    const admin = await this.getById(id);

    if (id === actorId && (dto.isActive === false || (dto.role && dto.role !== admin.role))) {
      throw new BadRequestException('Нельзя отключить себя или изменить свою роль');
    }
    if (dto.phone && dto.phone !== admin.phone) {
      if (await this.repo.exist({ where: { phone: dto.phone } })) {
        throw new ConflictException('Телефон уже занят');
      }
      admin.phone = dto.phone;
    }
    if (dto.name !== undefined) admin.name = dto.name;
    if (dto.role !== undefined) admin.role = dto.role;
    if (dto.isActive !== undefined) admin.isActive = dto.isActive;

    await this.repo.save(admin);

    const patch: Partial<Admin> = {};
    if (dto.password) patch.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    // смена пароля или отключение — разлогиниваем админа
    if (dto.password || dto.isActive === false) patch.refreshTokenHash = null;
    if (Object.keys(patch).length) await this.repo.update(id, patch);

    return this.getById(id);
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) throw new BadRequestException('Нельзя удалить самого себя');
    const admin = await this.getById(id);
    // Админов не удаляем физически — на них ссылаются обработанные заказы
    admin.isActive = false;
    await this.repo.save(admin);
    await this.repo.update(id, { refreshTokenHash: null });
    return { success: true };
  }

  async changeOwnPassword(id: string, currentPassword: string, newPassword: string) {
    const admin = await this.findByIdWithSecrets(id);
    if (!admin || !(await bcrypt.compare(currentPassword, admin.passwordHash))) {
      throw new BadRequestException('Текущий пароль неверен');
    }
    await this.repo.update(id, {
      passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
      refreshTokenHash: null,
    });
  }

  setRefreshTokenHash(id: string, hash: string | null) {
    return this.repo.update(id, { refreshTokenHash: hash });
  }

  touchLogin(id: string) {
    return this.repo.update(id, { lastLoginAt: new Date() });
  }
}
