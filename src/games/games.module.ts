import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from './game.entity';
import { GamesAdminController, GamesPublicController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [TypeOrmModule.forFeature([Game])],
  controllers: [GamesPublicController, GamesAdminController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
