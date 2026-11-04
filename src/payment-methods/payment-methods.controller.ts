import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { AdminRole } from '../common/enums';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';

@ApiTags('Public / Payment methods')
@Controller('payment-methods')
export class PaymentMethodsPublicController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get()
  @ApiQuery({ name: 'currency', required: false, description: 'Валюта заказа — вернуть только подходящие способы' })
  @ApiOperation({ summary: 'Активные способы оплаты (QR, реквизиты)' })
  list(@Query('currency') currency?: string) {
    return this.service.findActive(currency);
  }
}

@ApiTags('Admin / Payment methods')
@ApiCookieAuth()
@UseGuards(AdminAuthGuard)
@Roles(AdminRole.SUPERADMIN)
@Controller('admin/payment-methods')
export class PaymentMethodsAdminController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get()
  @Roles(AdminRole.SUPERADMIN, AdminRole.ADMIN)
  list() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
