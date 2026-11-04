import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';
import { AdminRole } from '../../common/enums';
import { normalizePhone } from '../../common/utils/phone';

export class CreateAdminDto {
  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(/^\+\d{9,15}$/, { message: 'Неверный формат телефона' })
  phone: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Пароль должен быть не короче 8 символов' })
  password: string;

  @ApiProperty({ example: 'Али' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional({ enum: AdminRole, default: AdminRole.ADMIN })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;
}

export class UpdateAdminDto extends PartialType(CreateAdminDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
