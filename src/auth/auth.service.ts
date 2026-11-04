import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { CookieOptions, Response } from 'express';
import { Admin } from '../admins/admin.entity';
import { AdminsService } from '../admins/admins.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../common/guards/admin-auth.guard';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const REFRESH_PATH = '/api/admin/auth';
// фиктивный хэш, чтобы время ответа не выдавало, существует ли телефон
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly admins: AdminsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(phone: string, password: string, res: Response) {
    const admin = await this.admins.findByPhoneWithSecrets(phone);
    const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
    if (!admin || !ok) throw new UnauthorizedException('Неверный телефон или пароль');
    if (!admin.isActive) throw new UnauthorizedException('Аккаунт отключён');

    await this.issueTokens(admin, res);
    await this.admins.touchLogin(admin.id);
    return this.admins.getById(admin.id);
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) throw new UnauthorizedException('Нет refresh-токена');
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      this.clearCookies(res);
      throw new UnauthorizedException('Сессия истекла, войдите снова');
    }

    const admin = await this.admins.findByIdWithSecrets(payload.sub);
    if (!admin || !admin.isActive || admin.refreshTokenHash !== sha256(refreshToken)) {
      // токен уже был использован/отозван — возможна кража, обнуляем сессию
      if (admin) await this.admins.setRefreshTokenHash(admin.id, null);
      this.clearCookies(res);
      throw new UnauthorizedException('Сессия недействительна, войдите снова');
    }

    await this.issueTokens(admin, res);
    return this.admins.getById(admin.id);
  }

  async logout(adminId: string | undefined, res: Response) {
    if (adminId) await this.admins.setRefreshTokenHash(adminId, null);
    this.clearCookies(res);
    return { success: true };
  }

  /** Выпускает пару токенов, сохраняет хэш refresh в БД (ротация) и ставит cookies */
  private async issueTokens(admin: Admin, res: Response) {
    const refreshDays = Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 7);
    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, role: admin.role },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: admin.id, jti: randomUUID() },
      { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: `${refreshDays}d` },
    );
    await this.admins.setRefreshTokenHash(admin.id, sha256(refreshToken));

    const base = this.cookieBase();
    res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: '/', maxAge: refreshDays * 86_400_000 });
    res.cookie(REFRESH_COOKIE, refreshToken, { ...base, path: REFRESH_PATH, maxAge: refreshDays * 86_400_000 });
  }

  private clearCookies(res: Response) {
    const base = this.cookieBase();
    res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
  }

  private cookieBase(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE') === 'true',
      sameSite: (this.config.get('COOKIE_SAMESITE') || 'lax') as CookieOptions['sameSite'],
      domain: this.config.get('COOKIE_DOMAIN') || undefined,
    };
  }
}
