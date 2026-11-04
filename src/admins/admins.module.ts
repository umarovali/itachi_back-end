import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { Admin } from './admin.entity';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';

/** Global — чтобы AdminAuthGuard можно было использовать в любом модуле */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Admin])],
  controllers: [AdminsController],
  providers: [AdminsService, AdminAuthGuard],
  exports: [AdminsService, AdminAuthGuard],
})
export class AdminsModule {}
