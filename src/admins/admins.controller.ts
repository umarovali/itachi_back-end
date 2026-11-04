import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthAdmin, CurrentAdmin, Roles } from '../common/decorators';
import { AdminRole } from '../common/enums';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminsService } from './admins.service';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';

@ApiTags('Admin / Admins')
@ApiCookieAuth()
@UseGuards(AdminAuthGuard)
@Roles(AdminRole.SUPERADMIN)
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  @ApiOperation({ summary: 'Список админов (только SUPERADMIN)' })
  findAll() {
    return this.admins.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Создать админа' })
  create(@Body() dto: CreateAdminDto) {
    return this.admins.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить админа (имя, роль, телефон, пароль, активность)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto, @CurrentAdmin() me: AuthAdmin) {
    return this.admins.update(id, dto, me.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Отключить админа (мягкое удаление)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() me: AuthAdmin) {
    return this.admins.remove(id, me.id);
  }
}
