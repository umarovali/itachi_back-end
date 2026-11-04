import {
  Body,
  Controller,
  Get,
  HttpCode,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { map, Observable } from 'rxjs';
import { AuthAdmin, ClientCountry, CurrentAdmin } from '../common/decorators';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { receiptUploadOptions } from '../common/utils/upload';
import {
  AdminNoteDto,
  CompleteOrderDto,
  CreateOrderDto,
  OrdersQueryDto,
  RejectOrderDto,
  SubmitPaymentDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('Public / Orders')
@Controller('orders')
export class OrdersPublicController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Шаг 1: создать заказ (товар + данные игрока + Telegram)' })
  create(@Body() dto: CreateOrderDto, @ClientCountry() country: string | null) {
    return this.orders.create(dto, country);
  }

  @Post(':id/payment')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Шаг 2: отправить чек (multipart: paymentMethodId, paidAmount, receipt)' })
  @UseInterceptors(FileInterceptor('receipt', receiptUploadOptions))
  submitPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitPaymentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.orders.submitPayment(id, dto, file);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Статус заказа (клиент опрашивает эту ручку)' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getPublic(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Отменить неоплаченный заказ' })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancelByCustomer(id);
  }
}

/** Заказы доступны обеим ролям: SUPERADMIN и ADMIN */
@ApiTags('Admin / Orders')
@ApiCookieAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/orders')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Список заказов с фильтрами' })
  list(@Query() q: OrdersQueryDto, @CurrentAdmin() me: AuthAdmin) {
    return this.orders.list(q, me);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Счётчики по статусам и выручка' })
  stats() {
    return this.orders.stats();
  }

  @Sse('events')
  @ApiOperation({ summary: 'SSE-поток событий о заказах (new EventSource(url, { withCredentials: true }))' })
  events(): Observable<MessageEvent> {
    return this.orders.events.pipe(map((e) => ({ type: e.type, data: e })));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детали заказа' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getForAdmin(id);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Файл чека' })
  async receipt(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const path = await this.orders.getReceiptPath(id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(path);
  }

  @Post(':id/take')
  @HttpCode(200)
  @ApiOperation({ summary: 'Взять в работу' })
  take(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() me: AuthAdmin) {
    return this.orders.take(id, me);
  }

  @Post(':id/release')
  @HttpCode(200)
  @ApiOperation({ summary: 'Вернуть в очередь' })
  release(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() me: AuthAdmin) {
    return this.orders.release(id, me);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Подтвердить: счёт пополнен / код выдан' })
  complete(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteOrderDto, @CurrentAdmin() me: AuthAdmin) {
    return this.orders.complete(id, dto, me);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Отклонить с причиной' })
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectOrderDto, @CurrentAdmin() me: AuthAdmin) {
    return this.orders.reject(id, dto, me);
  }

  @Patch(':id/note')
  @ApiOperation({ summary: 'Внутренняя заметка к заказу' })
  note(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminNoteDto) {
    return this.orders.setNote(id, dto.adminNote);
  }
}
