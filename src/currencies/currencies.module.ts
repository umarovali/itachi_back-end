import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrenciesAdminController, CurrenciesPublicController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { Currency } from './currency.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Currency])],
  controllers: [CurrenciesPublicController, CurrenciesAdminController],
  providers: [CurrenciesService],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
