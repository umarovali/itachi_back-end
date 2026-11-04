import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'СБП — Сбербанк' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional({ example: '/uploads/qr.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  qrImageUrl?: string;

  @ApiPropertyOptional({ example: '+7 900 000-00-00, Иван И.' })
  @IsOptional()
  @IsString()
  details?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ example: ['RUB'], description: 'Валюты, в которых принимается оплата. Пусто — любая' })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v)) : value,
  )
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(/^[A-Z]{3}$/, { each: true, message: 'currencies: коды валют из 3 букв' })
  currencies?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdatePaymentMethodDto extends PartialType(CreatePaymentMethodDto) {}
