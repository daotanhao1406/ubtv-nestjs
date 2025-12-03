import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { MoviesModule } from './movies/movies.module'
import { MongooseModule } from '@nestjs/mongoose'
import { EpisodesModule } from './episodes/episodes.module';

@Module({
  imports: [MongooseModule.forRoot('mongodb://localhost:27017/movie_db'), MoviesModule, EpisodesModule],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
