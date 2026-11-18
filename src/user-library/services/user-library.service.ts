import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { UsersService } from '../../users/services/users.service'
import { WatchedMovie } from '../schemas/watched-movie.schema'

const WATCHED_RETENTION_MONTHS = 6

export interface LibraryMovieIdsPage {
  movieIds: string[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface FavoriteStatus {
  movieId: string
  isFavorite: boolean
}

export interface WatchedPlayback {
  movieId: string
  watchedAt: Date
  expiresAt: Date
}

export function getWatchedExpiryDate(watchedAt: Date): Date {
  const targetMonth = watchedAt.getUTCMonth() + WATCHED_RETENTION_MONTHS
  const targetYear = watchedAt.getUTCFullYear() + Math.floor(targetMonth / 12)
  const month = targetMonth % 12
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate()
  const day = Math.min(watchedAt.getUTCDate(), lastDayOfTargetMonth)

  return new Date(
    Date.UTC(
      targetYear,
      month,
      day,
      watchedAt.getUTCHours(),
      watchedAt.getUTCMinutes(),
      watchedAt.getUTCSeconds(),
      watchedAt.getUTCMilliseconds(),
    ),
  )
}

@Injectable()
export class UserLibraryService {
  constructor(
    private readonly users: UsersService,
    @InjectModel(WatchedMovie.name) private readonly watchedMovies: Model<WatchedMovie>,
  ) {}

  async listFavoriteMovieIds(userId: string, page: number, pageSize: number): Promise<LibraryMovieIdsPage> {
    const result = await this.users.listFavoriteMovieIds(userId, page, pageSize)
    return this.withPagination(result.movieIds, page, pageSize, result.total)
  }

  async addFavoriteMovieId(userId: string, movieId: string): Promise<FavoriteStatus> {
    await this.users.addFavoriteMovieId(userId, movieId)
    return { movieId, isFavorite: true }
  }

  async removeFavoriteMovieId(userId: string, movieId: string): Promise<FavoriteStatus> {
    await this.users.removeFavoriteMovieId(userId, movieId)
    return { movieId, isFavorite: false }
  }

  async listWatchedMovieIds(
    userId: string,
    page: number,
    pageSize: number,
    now = new Date(),
  ): Promise<LibraryMovieIdsPage> {
    const filter = { userId: new Types.ObjectId(userId), expiresAt: { $gt: now } }
    const [total, watched] = await Promise.all([
      this.watchedMovies.countDocuments(filter).exec(),
      this.watchedMovies
        .find(filter)
        .sort({ watchedAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select('movieId')
        .lean()
        .exec(),
    ])

    return this.withPagination(
      watched.map(item => item.movieId),
      page,
      pageSize,
      total,
    )
  }

  async recordPlaybackStart(userId: string, movieId: string, watchedAt = new Date()): Promise<WatchedPlayback> {
    const userObjectId = new Types.ObjectId(userId)
    const expiresAt = getWatchedExpiryDate(watchedAt)
    const filter = { userId: userObjectId, movieId }
    const newestPlaybackFilter = { ...filter, watchedAt: { $lte: watchedAt } }
    const refresh = { $set: { watchedAt, expiresAt } }

    const refreshed = await this.watchedMovies.updateOne(newestPlaybackFilter, refresh, { runValidators: true }).exec()
    if (refreshed.matchedCount === 0) {
      try {
        await this.watchedMovies
          .updateOne(
            filter,
            { $setOnInsert: { userId: userObjectId, movieId, watchedAt, expiresAt } },
            { upsert: true, runValidators: true },
          )
          .exec()
      } catch (error) {
        // Concurrent first playback requests can race on the unique user/movie index.
        if ((error as { code?: number }).code !== 11000) throw error
      }

      // Apply this event only if it is newer than the row created by a concurrent request.
      await this.watchedMovies.updateOne(newestPlaybackFilter, refresh, { runValidators: true }).exec()
    }

    return { movieId, watchedAt, expiresAt }
  }

  private withPagination(movieIds: string[], page: number, pageSize: number, total: number): LibraryMovieIdsPage {
    return { movieIds, page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
  }
}
