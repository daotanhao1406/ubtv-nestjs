import { Module } from '@nestjs/common'
import { MoviesService } from './movies.service'
import { MoviesController } from './movies.controller'
import { MongooseModule } from '@nestjs/mongoose'
import { Movie, MovieSchema } from './entities/movie.entity'

@Module({
  imports: [
    // Đăng ký Schema Movie vào module này để Service có thể dùng
    MongooseModule.forFeature([{ name: Movie.name, schema: MovieSchema }]),
  ],
  controllers: [MoviesController],
  providers: [MoviesService],
})
export class MoviesModule {}
