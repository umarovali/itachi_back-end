import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ProductType } from '../../common/enums';
import { GameFieldDto } from '../../games/dto/game-field.dto';

export class CreateProductDto {
  @ApiProperty()
  @IsUUID()
  gameId: string;

  @ApiProperty({ example: '110 алмазов' })
  @IsString()
  @Length(1, 150)
  name: string;

  @ApiProperty({ enum: ProductType, default: ProductType.CURRENCY })
  @IsEnum(ProductType)
  type: ProductType;

  @ApiPropertyOptional({ example: 110 })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number | null;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bonusAmount?: number;

  @ApiProperty({ example: 84 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @ApiPropertyOptional({ example: 99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  oldPrice?: number | null;

  @ApiPropertyOptional({
    example: { UZS: { price: 13000, oldPrice: 15000 } },
    nullable: true,
    description: 'Ручные цены в других валютах. Нет валюты — цена по курсу. null — сбросить все',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsObject()
  prices?: Record<string, { price: number; oldPrice?: number | null }> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({
    type: [GameFieldDto],
    nullable: true,
    description: 'null — брать поля игры; [] — без полей; или свой набор',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => GameFieldDto)
  fields?: GameFieldDto[] | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['gameId'] as const)) {}
