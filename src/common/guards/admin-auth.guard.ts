import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AdminsService } from '../../admins/admins.service';
import { ROLES_KEY } from '../decorators';
import { AdminRole } from '../enums';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/**
 * Проверяет access-токен из httpOnly cookie, подгружает админа из БД
 * (чтобы отключение аккаунта / смена роли действовали сразу) и проверяет @Roles().
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly admins: AdminsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token: string | undefined = req.cookies?.[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedException('Требуется авторизация');

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Токен недействителен или истёк');
    }

    const admin = await this.admins.findById(payload.sub);
    if (!admin || !admin.isActive) throw new UnauthorizedException('Аккаунт не найден или отключён');
    req.admin = { id: admin.id, role: admin.role, name: admin.name, phone: admin.phone };

    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles?.length && !roles.includes(admin.role)) {
      throw new ForbiddenException('Недостаточно прав');
    }
    return true;
  }
}
