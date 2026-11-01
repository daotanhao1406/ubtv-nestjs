import { Model, Types } from 'mongoose'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REFRESH_TOKEN_TTL_MS } from '../../constants/auth.constants'
import { RefreshSessionsService } from '../../services/refresh-sessions.service'
import { RefreshSession, RefreshSessionSchema } from '../../schemas/refresh-session.schema'

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const userId = new Types.ObjectId('507f1f77bcf86cd799439011')

describe('RefreshSessionsService', () => {
  const model = { create: vi.fn(), findOneAndUpdate: vi.fn(), deleteOne: vi.fn() }
  const service = new RefreshSessionsService(model as unknown as Model<RefreshSession>)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))
    model.deleteOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 0 }) })
  })
  afterEach(() => vi.useRealTimers())

  it('stores only a SHA-256 hash of a random 32-byte token', async () => {
    const first = await service.create(userId.toString())
    const second = await service.create(userId.toString())
    expect(first.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(first.refreshToken, 'base64url')).toHaveLength(32)
    expect(second.refreshToken).not.toBe(first.refreshToken)
    expect(first.expiresAt.getTime()).toBe(Date.now() + REFRESH_TOKEN_TTL_MS)
    expect(model.create).toHaveBeenCalledWith({
      userId: userId.toString(),
      tokenHash: hash(first.refreshToken),
      expiresAt: first.expiresAt,
    })
    expect(JSON.stringify(model.create.mock.calls)).not.toContain(first.refreshToken)
  })

  it('rotates with a conditional atomic update and preserves expiry', async () => {
    const token = 'A'.repeat(43)
    const expiresAt = new Date(Date.now() + 1000)
    model.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue({ userId, expiresAt }) })
    const result = await service.rotate(token)
    expect(result.expiresAt).toEqual(expiresAt)
    expect(result.userId).toBe(userId.toString())
    expect(result.refreshToken).not.toBe(token)
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { tokenHash: hash(token), expiresAt: { $gt: new Date() } },
      { $set: { tokenHash: hash(result.refreshToken) } },
      { new: true },
    )
  })

  it('rejects expired or consumed tokens when the conditional update finds no document', async () => {
    model.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) })
    expect(await service.rotate('A'.repeat(43))).toBeNull()
  })

  it('handles a simulated race: only one rotation consumes the old hash', async () => {
    const token = 'A'.repeat(43)
    const expiresAt = new Date(Date.now() + 1000)
    let storedHash = hash(token)
    // Models a compare-and-swap result, not a claim about a real MongoDB instance.
    model.findOneAndUpdate.mockImplementation((filter, update) => ({
      exec: async () => {
        if (filter.tokenHash !== storedHash || expiresAt <= filter.expiresAt.$gt) return null
        storedHash = update.$set.tokenHash
        return { userId, expiresAt }
      },
    }))
    const results = await Promise.all([service.rotate(token), service.rotate(token)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await service.rotate(token)).toBeNull()
  })

  it.each([undefined, '', 'short', 'A'.repeat(44), { token: 'A'.repeat(43) }])(
    'rejects malformed cookie values without querying MongoDB',
    async token => {
      expect(await service.rotate(token as string)).toBeNull()
      await service.revoke(token as string)
      expect(model.findOneAndUpdate).not.toHaveBeenCalled()
      expect(model.deleteOne).not.toHaveBeenCalled()
    },
  )

  it('makes revocation idempotent and scopes it to the supplied token hash', async () => {
    const token = 'A'.repeat(43)
    await service.revoke(token)
    await service.revoke(token)
    expect(model.deleteOne).toHaveBeenCalledWith({ tokenHash: hash(token) })
  })

  it('defines a unique token index and a TTL cleanup index', () => {
    expect(RefreshSessionSchema.indexes()).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ tokenHash: 1 }), expect.objectContaining({ unique: true })],
        [{ expiresAt: 1 }, expect.objectContaining({ expireAfterSeconds: 0 })],
      ]),
    )
  })
})
