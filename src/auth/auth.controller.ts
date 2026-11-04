import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ChangePasswordDto } from '../admins/dto/admin.dto';
import { AdminsService } from '../admins/admins.service';
import { AuthAdmin, CurrentAdmin } from '../common/decorators';
import { AdminAuthGuard, REFRESH_COOKIE } from '../common/guards/admin-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Admin / Auth')
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly admins: AdminsService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Вход по телефону и паролю. Токены ставятся в httpOnly cookies' })
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto.phone, dto.password, res);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Обновить access-токен по refresh-cookie' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req.cookies?.[REFRESH_COOKIE], res);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiCookieAuth()
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'Выход' })
  logout(@CurrentAdmin() me: AuthAdmin, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(me.id, res);
  }

  @Get('me')
  @ApiCookieAuth()
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'Текущий админ' })
  me(@CurrentAdmin() me: AuthAdmin) {
    return this.admins.getById(me.id);
  }

  @Post('change-password')
  @HttpCode(200)
  @ApiCookieAuth()
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'Сменить свой пароль (после этого нужно войти заново)' })
  async changePassword(
    @CurrentAdmin() me: AuthAdmin,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.admins.changeOwnPassword(me.id, dto.currentPassword, dto.newPassword);
    return this.auth.logout(undefined, res);
  }
}
