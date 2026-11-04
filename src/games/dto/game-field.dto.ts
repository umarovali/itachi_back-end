import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { FieldType } from '../../common/enums';

export class FieldOptionDto {
  @ApiProperty({ example: 'asia' })
  @IsString()
  @Length(1, 100)
  value: string;

  @ApiProperty({ example: 'Asia' })
  @IsString()
  @Length(1, 100)
  label: string;
}

/**
 * Описание одного поля формы заказа.
 * Пример для Free Fire:   [{ key: "playerId", label: "ID игрока", type: "number", required: true }]
 * Пример для Genshin:     [{ key: "uid", ... }, { key: "server", type: "select", options: [...] }]
 * Пример для Steam/др.:   [{ key: "email", label: "Email аккаунта", type: "email", required: true }]
 */
export class GameFieldDto {
  @ApiProperty({ example: 'playerId', description: 'Ключ в playerData заказа (латиница)' })
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/, { message: 'key: латиница/цифры/_, начинается с буквы' })
  key: string;

  @ApiProperty({ example: 'ID игрока' })
  @IsString()
  @Length(1, 100)
  label: string;

  @ApiProperty({ enum: FieldType, example: FieldType.NUMBER })
  @IsEnum(FieldType)
  type: FieldType;

  @ApiProperty({ default: true })
  @IsBoolean()
  required: boolean;

  @ApiPropertyOptional({ example: '123456789' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  placeholder?: string;

  @ApiPropertyOptional({ example: 'ID можно найти в профиле игры' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  hint?: string;

  @ApiPropertyOptional({ example: '^\\d{6,12}$', description: 'Регулярка для проверки значения' })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  pattern?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxLength?: number;

  @ApiPropertyOptional({ type: [FieldOptionDto], description: 'Только для type=select' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FieldOptionDto)
  options?: FieldOptionDto[];
}

/** Тип, который хранится в jsonb */
export type GameField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  hint?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  options?: { value: string; label: string }[];
};
