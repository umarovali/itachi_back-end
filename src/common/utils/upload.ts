import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, resolve } from 'path';

export const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR || './uploads');
/** Чеки — приватные, отдаются только админам через API */
export const RECEIPTS_DIR = resolve(UPLOAD_ROOT, 'receipts');
/** Картинки игр/товаров/QR — публичные, раздаются статикой по /uploads/... */
export const PUBLIC_DIR = resolve(UPLOAD_ROOT, 'public');

for (const dir of [RECEIPTS_DIR, PUBLIC_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const RECEIPT_MIME = [...IMAGE_MIME, 'application/pdf'];
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

function makeOptions(dir: string, allowed: string[], maxMb: number) {
  return {
    storage: diskStorage({
      destination: dir,
      filename: (_req, file, cb) =>
        cb(null, `${randomUUID()}${EXT_BY_MIME[file.mimetype] ?? extname(file.originalname)}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (
      _req: unknown,
      file: Express.Multer.File,
      cb: (e: Error | null, ok: boolean) => void,
    ) => {
      if (!allowed.includes(file.mimetype)) {
        return cb(new BadRequestException(`Недопустимый тип файла. Разрешены: ${allowed.join(', ')}`), false);
      }
      cb(null, true);
    },
  };
}

export const receiptUploadOptions = makeOptions(RECEIPTS_DIR, RECEIPT_MIME, 10);
export const imageUploadOptions = makeOptions(PUBLIC_DIR, IMAGE_MIME, 5);
