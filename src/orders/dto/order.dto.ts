import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { OrderStatus, RejectReason } from '../../common/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ================= клиент =================

export class CreateOrderDto {
  @ApiProperty({ description: 'Выбранный товар (пакет)' })
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: { playerId: '123456789' },
    description: 'Значения полей формы. Ключи — из fields товара/игры',
  })
  @IsObject()
  playerData: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'UZS', description: 'Валюта, выбранная на сайте. Без неё — по стране клиента' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{3}$/, { message: 'currency: код валюты из 3 букв' })
  currency?: string;

  @ApiProperty({ example: '@nickname' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/^@/, '') : value))
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/, { message: 'Неверный Telegram ник' })
  telegramUsername: string;
}

/** multipart/form-data: paymentMethodId, paidAmount, receipt (файл) */
export class SubmitPaymentDto {
  @ApiProperty()
  @IsUUID()
  paymentMethodId: string;

  @ApiProperty({ example: 84, description: 'Сумма, которую клиент перевёл' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  paidAmount: number;

  @ApiProperty({ type: 'string', format: 'binary', description: 'Скриншот / PDF чека' })
  receipt?: unknown;
}

// ================= админ =================

export class OrdersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus, isArray: true, description: 'Можно несколько: ?status=A&status=B' })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  gameId?: string;

  @ApiPropertyOptional({ description: 'Номер заказа, telegram или значение из playerData' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 'UZS' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ description: 'true — только мои заказы в работе' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  mine?: boolean;
}

export class CompleteOrderDto {
  @ApiPropertyOptional({ example: 'Алмазы зачислены, приятной игры!' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  customerMessage?: string;

  @ApiPropertyOptional({ description: 'Код ваучера (обязателен для VOUCHER)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  deliveredData?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}

export class RejectOrderDto {
  @ApiProperty({ enum: RejectReason })
  @IsEnum(RejectReason)
  reason: RejectReason;

  @ApiPropertyOptional({ example: 'В чеке сумма 80 ₽, а пакет стоит 84 ₽' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  customerMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}

export class AdminNoteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  adminNote: string;
}
