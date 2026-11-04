import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const upperArr = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v)) : value;

export class CreateCurrencyDto {
  @ApiProperty({ example: 'UZS' })
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, { message: 'code: 3 латинские буквы (ISO 4217)' })
  code: string;

  @ApiProperty({ example: 'Узбекский сум' })
  @IsString()
  @Length(1, 50)
  name: string;

  @ApiProperty({ example: 'сум' })
  @IsString()
  @Length(1, 10)
  symbol: string;

  @ApiPropertyOptional({
    example: 160,
    description: 'Ручной курс: единиц этой валюты за 1 базовую. Обязателен, если autoRate=false',
  })
  @ValidateIf((o) => !o.autoRate || o.rate !== undefined)
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate?: number;

  @ApiPropertyOptional({ default: false, description: 'Брать курс ЦБ автоматически' })
  @IsOptional()
  @IsBoolean()
  autoRate?: boolean;

  @ApiPropertyOptional({ example: 3, default: 0, description: 'Наценка к курсу ЦБ, %' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  markupPercent?: number;

  @ApiPropertyOptional({ example: 500, default: 1, description: 'Округлять цену вверх до кратного' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  roundTo?: number;

  @ApiPropertyOptional({ example: ['UZ'], description: 'Страны, где валюта выбирается автоматически' })
  @IsOptional()
  @Transform(upperArr)
  @IsArray()
  @ArrayMaxSize(250)
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'countries: коды стран из 2 букв' })
  countries?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCurrencyDto extends PartialType(OmitType(CreateCurrencyDto, ['code'] as const)) {}
