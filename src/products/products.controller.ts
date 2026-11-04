import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductsService } from './products.service';

@ApiTags('Admin / Products')
@ApiCookieAuth()
@UseGuards(AdminAuthGuard)
// товары и цены могут менять обе роли (SUPERADMIN и ADMIN)
@Controller('admin/products')
export class ProductsAdminController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiQuery({ name: 'gameId', required: true })
  @ApiOperation({ summary: 'Товары игры (включая скрытые)' })
  list(@Query('gameId', ParseUUIDPipe) gameId: string) {
    return this.products.findByGame(gameId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Создать товар' })
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить товар: цена, название, скрыть и т.д.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить товар (если по нему нет заказов)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }
}
