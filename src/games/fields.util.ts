import { BadRequestException } from '@nestjs/common';
import { FieldType } from '../common/enums';
import { GameField } from './dto/game-field.dto';

/** Проверка самой схемы полей (при создании/редактировании игры или товара) */
export function assertValidFieldSchema(fields: GameField[]) {
  const keys = new Set<string>();
  for (const f of fields) {
    if (keys.has(f.key)) throw new BadRequestException(`Поле "${f.key}" повторяется`);
    keys.add(f.key);
    if (f.type === FieldType.SELECT && !f.options?.length) {
      throw new BadRequestException(`Поле "${f.key}" типа select должно иметь options`);
    }
    if (f.pattern) {
      try {
        new RegExp(f.pattern);
      } catch {
        throw new BadRequestException(`Поле "${f.key}": некорректная регулярка pattern`);
      }
    }
    if (f.minLength !== undefined && f.maxLength !== undefined && f.minLength > f.maxLength) {
      throw new BadRequestException(`Поле "${f.key}": minLength > maxLength`);
    }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{7,15}$/;

/**
 * Проверка данных клиента по схеме полей. Возвращает очищенный объект
 * (только известные ключи, строки обрезаны). Лишние ключи отбрасываются.
 */
export function validatePlayerData(fields: GameField[], input: unknown): Record<string, string> {
  const data = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const result: Record<string, string> = {};

  for (const f of fields) {
    const raw = data[f.key];
    const value = raw === undefined || raw === null ? '' : String(raw).trim();

    if (!value) {
      if (f.required) errors.push(`${f.label}: обязательное поле`);
      continue;
    }
    if (value.length > 500) {
      errors.push(`${f.label}: слишком длинное значение`);
      continue;
    }
    if (f.minLength !== undefined && value.length < f.minLength) errors.push(`${f.label}: минимум ${f.minLength} символов`);
    if (f.maxLength !== undefined && value.length > f.maxLength) errors.push(`${f.label}: максимум ${f.maxLength} символов`);

    switch (f.type) {
      case FieldType.NUMBER:
        if (!/^\d+$/.test(value)) errors.push(`${f.label}: только цифры`);
        break;
      case FieldType.EMAIL:
        if (!EMAIL_RE.test(value)) errors.push(`${f.label}: неверный email`);
        break;
      case FieldType.PHONE:
        if (!PHONE_RE.test(value.replace(/[\s()-]/g, ''))) errors.push(`${f.label}: неверный телефон`);
        break;
      case FieldType.SELECT:
        if (!f.options?.some((o) => o.value === value)) errors.push(`${f.label}: выберите значение из списка`);
        break;
    }
    if (f.pattern && !new RegExp(f.pattern).test(value)) errors.push(`${f.label}: неверный формат`);

    result[f.key] = value;
  }

  if (errors.length) throw new BadRequestException(errors);
  return result;
}
