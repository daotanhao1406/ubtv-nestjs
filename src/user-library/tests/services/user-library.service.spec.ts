import { Model, Types } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WatchedMovie, WatchedMovieSchema } from '../../schemas/watched-movie.schema'
import { getWatchedExpiryDate, UserLibraryService } from '../../services/user-library.service'

describe('UserLibraryService', () => {
  const users = {
    listFavoriteMovieIds: vi.fn(),
    addFavoriteMovieId: vi.fn(),
    removeFavoriteMovieId: vi.fn(),
  }
  const findQuery = {
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(),
  }
  const model = {
    countDocuments: vi.fn(),
    find: vi.fn(),
    updateOne: vi.fn(),
  }
  const service = new UserLibraryService(users as never, model as unknown as Model<WatchedMovie>)

  beforeEach(() => {
    vi.resetAllMocks()
    findQuery.sort.mockReturnValue(findQuery)
    findQuery.skip.mockReturnValue(findQuery)
    findQuery.limit.mockReturnValue(findQuery)
    findQuery.select.mockReturnValue(findQuery)
    findQuery.lean.mockReturnValue(findQuery)
    model.find.mockReturnValue(findQuery)
  })

  it('returns paginated favorite IDs in the order supplied by the user record', async () => {
    users.listFavoriteMovieIds.mockResolvedValue({ movieIds: ['first', 'second'], total: 2 })

    await expect(service.listFavoriteMovieIds('507f1f77bcf86cd799439011', 1, 50)).resolves.toEqual({
      movieIds: ['first', 'second'],
      page: 1,
      pageSize: 50,
      total: 2,
      totalPages: 1,
    })
  })

  it('filters expired watched entries and sorts the newest playback first', async () => {
    const now = new Date('2026-11-12T00:00:00.000Z')
    model.countDocuments.mockReturnValue({ exec: vi.fn().mockResolvedValue(1) })
    findQuery.exec.mockResolvedValue([{ movieId: 'recent-id' }])

    await expect(service.listWatchedMovieIds('507f1f77bcf86cd799439011', 1, 20, now)).resolves.toEqual({
      movieIds: ['recent-id'],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })
    expect(model.find).toHaveBeenCalledWith({
      userId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      expiresAt: { $gt: now },
    })
    expect(findQuery.sort).toHaveBeenCalledWith({ watchedAt: -1, _id: -1 })
    expect(findQuery.skip).toHaveBeenCalledWith(0)
    expect(findQuery.limit).toHaveBeenCalledWith(20)
  })

  it('refreshes watchedAt and calendar expiry for repeat playback', async () => {
    const watchedAt = new Date('2026-11-12T10:15:00.000Z')
    model.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ matchedCount: 1 }) })

    await expect(
      service.recordPlaybackStart('507f1f77bcf86cd799439011', 'external-movie-id', watchedAt),
    ).resolves.toEqual({
      movieId: 'external-movie-id',
      watchedAt,
      expiresAt: new Date('2027-05-12T10:15:00.000Z'),
    })
    expect(model.updateOne).toHaveBeenCalledWith(
      {
        userId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        movieId: 'external-movie-id',
        watchedAt: { $lte: watchedAt },
      },
      { $set: { watchedAt, expiresAt: new Date('2027-05-12T10:15:00.000Z') } },
      { runValidators: true },
    )
  })

  it('retries a concurrent first-playback upsert after the unique-index race', async () => {
    const duplicateKey = { code: 11000 }
    model.updateOne
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ matchedCount: 0 }) })
      .mockReturnValueOnce({ exec: vi.fn().mockRejectedValue(duplicateKey) })
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ matchedCount: 1 }) })

    await service.recordPlaybackStart(
      '507f1f77bcf86cd799439011',
      'external-movie-id',
      new Date('2026-01-31T00:00:00.000Z'),
    )

    expect(model.updateOne).toHaveBeenCalledTimes(3)
    expect(model.updateOne.mock.calls[1][2]).toEqual({ upsert: true, runValidators: true })
    expect(model.updateOne.mock.calls[2][2]).toEqual({ runValidators: true })
  })

  it('does not overwrite a newer playback timestamp with an older concurrent event', async () => {
    model.updateOne
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ matchedCount: 0 }) })
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ matchedCount: 1 }) })
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ matchedCount: 0 }) })

    await service.recordPlaybackStart(
      '507f1f77bcf86cd799439011',
      'external-movie-id',
      new Date('2026-01-31T00:00:00.000Z'),
    )

    expect(model.updateOne).toHaveBeenCalledTimes(3)
    expect(model.updateOne.mock.calls[0][0]).toMatchObject({
      watchedAt: { $lte: new Date('2026-01-31T00:00:00.000Z') },
    })
    expect(model.updateOne.mock.calls[2][0]).toEqual(model.updateOne.mock.calls[0][0])
  })
})

describe('watched retention', () => {
  it('adds six UTC calendar months and preserves time of day', () => {
    expect(getWatchedExpiryDate(new Date('2026-11-12T10:15:30.250Z'))).toEqual(new Date('2027-05-12T10:15:30.250Z'))
  })

  it('clamps to the final day when the destination month is shorter', () => {
    expect(getWatchedExpiryDate(new Date('2026-08-31T10:15:00.000Z'))).toEqual(new Date('2027-02-28T10:15:00.000Z'))
  })

  it('enforces one entry per user/movie and expires records using expiresAt', () => {
    const indexes = WatchedMovieSchema.indexes()

    expect(indexes).toContainEqual([
      { userId: 1, movieId: 1 },
      { unique: true, background: true },
    ])
    expect(indexes).toContainEqual([{ expiresAt: 1 }, { expireAfterSeconds: 0, background: true }])
  })
})
