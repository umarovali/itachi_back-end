import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { imageUploadOptions } from '../common/utils/upload';

@ApiTags('Admin / Uploads')
@ApiCookieAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/uploads')
export class UploadsController {
  @Post('image')
  @ApiOperation({ summary: 'Загрузить картинку (иконка игры, товара, QR). Возвращает url для сохранения в сущности' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл не передан');
    return { url: `/uploads/${file.filename}` };
  }
}
