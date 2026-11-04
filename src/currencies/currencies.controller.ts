import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ClientCountry, Roles } from '../common/decorators';
import { AdminRole } from '../common/enums';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto, UpdateCurrencyDto } from './dto/currency.dto';

@ApiTags('Public / Currencies')
@Controller('currencies')
export class CurrenciesPublicController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get()
  @ApiQuery({ name: 'currency', required: false, description: 'Выбранная клиентом валюта (если есть)' })
  @ApiOperation({ summary: 'Активные валюты + какая выбрана для клиента (по выбору или по стране)' })
  async list(@Query('currency') currency: string | undefined, @ClientCountry() country: string | null) {
    const [items, selected] = await Promise.all([this.currencies.active(), this.currencies.resolve(currency, country)]);
    return {
      country,
      selected: selected.code,
      items: items.map(({ code, name, symbol, isBase }) => ({ code, name, symbol, isBase })),
    };
  }
}

@ApiTags('Admin / Currencies')
@ApiCookieAuth()
@UseGuards(AdminAuthGuard)
@Roles(AdminRole.SUPERADMIN)
@Controller('admin/currencies')
export class CurrenciesAdminController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get()
  @Roles(AdminRole.SUPERADMIN, AdminRole.ADMIN)
  list() {
    return this.currencies.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Добавить валюту (SUPERADMIN)' })
  create(@Body() dto: CreateCurrencyDto) {
    return this.currencies.create(dto);
  }

  @Post('sync-rates')
  @HttpCode(200)
  @ApiOperation({ summary: 'Обновить курсы ЦБ прямо сейчас (для валют с autoRate)' })
  async sync() {
    try {
      return await this.currencies.syncRates();
    } catch (e: any) {
      throw new BadGatewayException(`Не удалось получить курсы: ${e.message}`);
    }
  }

  @Patch(':code')
  @ApiOperation({ summary: 'Изменить курс, округление, страны (SUPERADMIN)' })
  update(@Param('code') code: string, @Body() dto: UpdateCurrencyDto) {
    return this.currencies.update(code, dto);
  }

  @Delete(':code')
  remove(@Param('code') code: string) {
    return this.currencies.remove(code);
  }
}
