import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AdminRole } from '../enums';

export const ROLES_KEY = 'roles';
/** Ограничить эндпоинт ролями. Без декоратора — доступен любому авторизованному админу */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthAdmin {
  id: string;
  role: AdminRole;
  name: string;
  phone: string;
}

/**
 * Страна клиента (ISO alpha-2) из заголовка, который ставит CDN / прокси:
 * Cloudflare — CF-IPCountry, nginx geoip — обычно X-Country-Code.
 * Имя заголовка можно задать в GEO_COUNTRY_HEADER.
 */
export const ClientCountry = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | null => {
  const headers = ctx.switchToHttp().getRequest().headers;
  const custom = process.env.GEO_COUNTRY_HEADER?.toLowerCase();
  const raw = (custom && headers[custom]) || headers['cf-ipcountry'] || headers['x-country-code'];
  const value = String(Array.isArray(raw) ? raw[0] : raw ?? '').trim().toUpperCase();
  // XX / T1 — Cloudflare: неизвестно / Tor
  return /^[A-Z]{2}$/.test(value) && value !== 'XX' && value !== 'T1' ? value : null;
});

export const CurrentAdmin =createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthAdmin => ctx.switchToHttp().getRequest().admin,
);
