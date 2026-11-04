import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { GameFieldDto } from './game-field.dto';

export class CreateGameDto {
  @ApiProperty({ example: 'free-fire' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug: латиница, цифры и дефисы' })
  @Length(2, 100)
  slug: string;

  @ApiProperty({ example: 'Free Fire' })
  @IsString()
  @Length(1, 150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '/uploads/abc.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ example: 'Алмазы' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  currencyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  currencyIconUrl?: string;

  @ApiPropertyOptional({ example: 'ID игрока находится в профиле, под ником' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiProperty({
    type: [GameFieldDto],
    example: [{ key: 'playerId', label: 'ID игрока', type: 'number', required: true, pattern: '^\\d{6,12}$' }],
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => GameFieldDto)
  fields: GameFieldDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateGameDto extends PartialType(CreateGameDto) {}
