import { Module } from '@nestjs/common'
import { EpisodesService } from './episodes.service'
import { EpisodesController } from './episodes.controller'
import { MongooseModule } from '@nestjs/mongoose'
import { Episode, EpisodeSchema } from './entities/episode.entity'
import { Movie, MovieSchema } from '../movies/entities/movie.entity'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Episode.name, schema: EpisodeSchema },
      { name: Movie.name, schema: MovieSchema },
    ]),
  ],
  controllers: [EpisodesController],
  providers: [EpisodesService],
})
export class EpisodesModule {}
