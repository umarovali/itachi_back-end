import 'dotenv/config'; // до остальных импортов: upload.ts читает UPLOAD_DIR при загрузке
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ACCESS_COOKIE } from './common/guards/admin-auth.guard';
import { PUBLIC_DIR } from './common/utils/upload';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.set('trust proxy', 1); // корректный IP для rate-limit за nginx
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true, // обязательно для cookies
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Публичные картинки (игры, товары, QR). Чеки сюда НЕ попадают.
  app.useStaticAssets(PUBLIC_DIR, { prefix: '/uploads/', maxAge: '7d' });

  // В проде Swagger выключен, но для тестового сервера его можно включить: SWAGGER_ENABLED=true
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const doc = new DocumentBuilder()
      .setTitle('TopUp API')
      .setDescription('Пополнение игровых валют: каталог, заказы, админка')
      .setVersion('0.1')
      .addCookieAuth(ACCESS_COOKIE)
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc), {
      swaggerOptions: { withCredentials: true, persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API: http://localhost:${port}/api  |  Swagger: http://localhost:${port}/docs`, 'Bootstrap');
}
bootstrap();
