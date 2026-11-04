import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MinLength } from 'class-validator';
import { normalizePhone } from '../../common/utils/phone';

export class LoginDto {
  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(/^\+\d{9,15}$/, { message: 'Неверный формат телефона' })
  phone: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  @MinLength(1)
  password: string;
}
