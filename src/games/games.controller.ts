import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ClientCountry, Roles } from '../common/decorators';
import { AdminRole } from '../common/enums';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { CreateGameDto, UpdateGameDto } from './dto/game.dto';
import { GamesService } from './games.service';

@ApiTags('Public / Games')
@Controller('games')
export class GamesPublicController {
  constructor(private readonly games: GamesService) {}

  @Get()
  @ApiOperation({ summary: 'Список активных игр' })
  list() {
    return this.games.findActive();
  }

  @Get(':slug')
  @ApiQuery({ name: 'currency', required: false, description: 'Выбранная валюта; без неё — по стране клиента' })
  @ApiOperation({ summary: 'Игра: товары (цены в валюте клиента) и поля формы заказа' })
  bySlug(
    @Param('slug') slug: string,
    @Query('currency') currency: string | undefined,
    @ClientCountry() country: string | null,
  ) {
    return this.games.findActiveBySlug(slug, currency, country);
  }
}

@ApiTags('Admin / Games')
@ApiCookieAuth()
@UseGuards(AdminAuthGuard)
@Roles(AdminRole.SUPERADMIN)
@Controller('admin/games')
export class GamesAdminController {
  constructor(private readonly games: GamesService) {}

  @Get()
  @Roles(AdminRole.SUPERADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Все игры (включая скрытые)' })
  list() {
    return this.games.findAll();
  }

  @Get(':id')
  @Roles(AdminRole.SUPERADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Игра со всеми товарами' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.games.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Создать игру (SUPERADMIN)' })
  create(@Body() dto: CreateGameDto) {
    return this.games.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить игру (SUPERADMIN)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGameDto) {
    return this.games.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить игру (если по ней нет заказов)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.games.remove(id);
  }
}
