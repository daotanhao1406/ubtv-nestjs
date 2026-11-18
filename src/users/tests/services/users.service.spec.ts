import { ConflictException, NotFoundException } from '@nestjs/common'
import { Model } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { User } from '../../schemas/user.schema'
import { UsersService } from '../../services/users.service'

describe('UsersService', () => {
  const query = { select: vi.fn(), lean: vi.fn(), exec: vi.fn() }
  const model = { create: vi.fn(), findOne: vi.fn(), findById: vi.fn(), updateOne: vi.fn() }
  const service = new UsersService(model as unknown as Model<User>)
  beforeEach(() => {
    vi.resetAllMocks()
    model.findOne.mockReturnValue(query)
    model.findById.mockReturnValue(query)
    query.select.mockReturnValue(query)
    query.lean.mockReturnValue(query)
    model.updateOne.mockReturnValue(query)
  })

  it('normalizes email before storing and queries credentials explicitly', async () => {
    await service.create({ name: 'An', email: ' AN@EXAMPLE.COM ', passwordHash: 'hash' })
    expect(model.create).toHaveBeenCalledWith({ name: 'An', email: 'an@example.com', passwordHash: 'hash' })
    await service.findByEmail(' AN@EXAMPLE.COM ')
    expect(model.findOne).toHaveBeenCalledWith({ email: 'an@example.com' })
    expect(query.select).toHaveBeenCalledWith('+passwordHash')
  })

  it('maps the database uniqueness race to 409', async () => {
    model.create.mockRejectedValue({ code: 11000 })
    await expect(service.create({ name: 'An', email: 'an@example.com', passwordHash: 'hash' })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('does not mask database failures', async () => {
    const error = new Error('database unavailable')
    model.create.mockRejectedValue(error)
    await expect(service.create({ name: 'An', email: 'an@example.com', passwordHash: 'hash' })).rejects.toBe(error)
  })

  it('does not query MongoDB with malformed user IDs', async () => {
    expect(await service.findById('not-an-id')).toBeNull()
    expect(model.findById).not.toHaveBeenCalled()
    await service.findById('507f1f77bcf86cd799439011')
    expect(model.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011')
    expect(query.select).not.toHaveBeenCalled()
  })

  it('returns a page of favorite IDs and the full count', async () => {
    query.exec.mockResolvedValue({ favoriteMovieIds: ['a', 'b', 'c'] })

    await expect(service.listFavoriteMovieIds('507f1f77bcf86cd799439011', 2, 2)).resolves.toEqual({
      movieIds: ['c'],
      total: 3,
    })
    expect(model.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011')
    expect(query.select).toHaveBeenCalledWith('favoriteMovieIds')
  })

  it('adds and removes external movie IDs atomically without ObjectId casting', async () => {
    query.exec.mockResolvedValue({ matchedCount: 1 })

    await service.addFavoriteMovieId('507f1f77bcf86cd799439011', '5d3ad84b2c465aa17fbb94de4f166985')
    expect(model.updateOne).toHaveBeenLastCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      { $addToSet: { favoriteMovieIds: '5d3ad84b2c465aa17fbb94de4f166985' } },
    )

    await service.removeFavoriteMovieId('507f1f77bcf86cd799439011', '5d3ad84b2c465aa17fbb94de4f166985')
    expect(model.updateOne).toHaveBeenLastCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      { $pull: { favoriteMovieIds: '5d3ad84b2c465aa17fbb94de4f166985' } },
    )
  })

  it('reports a missing account when changing favorites', async () => {
    query.exec.mockResolvedValue({ matchedCount: 0 })
    await expect(service.addFavoriteMovieId('507f1f77bcf86cd799439011', 'external-id')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
