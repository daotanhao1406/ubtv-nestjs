import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { UserLibraryController } from './controllers/user-library.controller'
import { WatchedMovie, WatchedMovieSchema } from './schemas/watched-movie.schema'
import { UserLibraryService } from './services/user-library.service'

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([{ name: WatchedMovie.name, schema: WatchedMovieSchema }]),
  ],
  controllers: [UserLibraryController],
  providers: [UserLibraryService],
})
export class UserLibraryModule {}
