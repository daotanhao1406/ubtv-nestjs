import { ConflictException } from '@nestjs/common'
import { Model } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { User } from '../../schemas/user.schema'
import { UsersService } from '../../services/users.service'

describe('UsersService', () => {
  const query = { select: vi.fn(), exec: vi.fn() }
  const model = { create: vi.fn(), findOne: vi.fn(), findById: vi.fn() }
  const service = new UsersService(model as unknown as Model<User>)
  beforeEach(() => {
    vi.resetAllMocks()
    model.findOne.mockReturnValue(query)
    model.findById.mockReturnValue(query)
    query.select.mockReturnValue(query)
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
})
