import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly db: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Проверка, что сервер и база живы (для хостинга)' })
  async check() {
    await this.db.query('SELECT 1');
    return { status: 'ok', time: new Date().toISOString() };
  }
}
