import { BadRequestException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Model } from 'mongoose'
import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MailService } from '../../../mail/services/mail.service'
import { PasswordReset } from '../../../users/schemas/password-reset.schema'
import { User, UserSchema } from '../../../users/schemas/user.schema'
import { UsersService } from '../../../users/services/users.service'
import { PASSWORD_RESET_REQUEST_MESSAGE } from '../../constants/password-reset.constants'
import { PasswordResetService } from '../../services/password-reset.service'
import { PasswordService } from '../../services/password.service'

const random = vi.hoisted(() => vi.fn(() => 12345))
vi.mock('node:crypto', async importOriginal => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomInt: random,
}))

const id = '507f1f77bcf86cd799439011'
const email = 'an@example.com'
const secret = 'a-distinct-unit-test-email-otp-secret-32-bytes'

interface StoredUser {
  _id: string
  email: string
  emailVerified: boolean
  passwordHash: string
  passwordVersion?: number
  passwordReset?: PasswordReset
  emailVerification?: { codeHash: string }
}

// Simulate the actual conditional queries to exercise races without contacting MongoDB.
function createDatabase() {
  let user: StoredUser | null = {
    _id: id,
    email,
    emailVerified: true,
    passwordHash: 'old-hash',
    emailVerification: { codeHash: 'registration-code-hash' },
  }
  const copy = () => structuredClone(user)
  const read = (key: string): unknown => {
    let value: unknown = user
    for (const part of key.split('.')) {
      value = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[part] : undefined
    }
    return value
  }
  const matches = (filter: Record<string, unknown>): boolean =>
    user !== null &&
    Object.entries(filter).every(([key, value]) => {
      if (key === '$or') return (value as Record<string, unknown>[]).some(matches)
      const actual = read(key)
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        return Object.entries(value).every(([operator, expected]) => {
          if (operator === '$exists') return (actual !== undefined) === expected
          if (operator === '$gt') return Number(actual) > Number(expected)
          if (operator === '$lte') return Number(actual) <= Number(expected)
          throw new Error(`Unsupported test predicate ${operator}`)
        })
      }
      return actual === value
    })
  const update = (changes: Record<string, Record<string, unknown>>) => {
    if (changes.$set?.passwordReset) user.passwordReset = structuredClone(changes.$set.passwordReset as PasswordReset)
    if (changes.$set?.['passwordReset.resetTokenHash']) {
      user.passwordReset.resetTokenHash = changes.$set['passwordReset.resetTokenHash'] as string
      user.passwordReset.resetExpiresAt = changes.$set['passwordReset.resetExpiresAt'] as Date
    }
    if (changes.$set?.passwordHash) user.passwordHash = changes.$set.passwordHash as string
    if (changes.$unset?.['passwordReset.codeHash']) delete user.passwordReset.codeHash
    if (changes.$unset?.passwordReset) delete user.passwordReset
    if (changes.$inc?.['passwordReset.attemptsRemaining']) {
      user.passwordReset.attemptsRemaining += Number(changes.$inc['passwordReset.attemptsRemaining'])
    }
    if (changes.$inc?.passwordVersion) user.passwordVersion = (user.passwordVersion ?? 0) + 1
  }
  const model = {
    findOne: vi.fn((filter: Record<string, unknown>) => ({
      select: vi.fn().mockReturnValue({ exec: async () => (matches(filter) ? copy() : null) }),
    })),
    findOneAndUpdate: vi.fn((filter, changes) => ({
      exec: async () => {
        if (!matches(filter)) return null
        update(changes)
        return copy()
      },
    })),
    updateOne: vi.fn((filter, changes) => ({
      exec: async () => {
        if (!matches(filter)) return { modifiedCount: 0 }
        update(changes)
        return { modifiedCount: 1 }
      },
    })),
  }
  return { model, current: copy, replace: (replacement: StoredUser | null) => (user = replacement) }
}

describe('PasswordResetService with conditional user updates', () => {
  let db: ReturnType<typeof createDatabase>
  let users: UsersService
  let service: PasswordResetService
  const mail = { sendPasswordReset: vi.fn(), sendPasswordResetConfirmation: vi.fn() }
  const passwords = { hash: vi.fn() }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))
    random.mockReturnValue(12345)
    passwords.hash.mockResolvedValue('new-password-hash')
    db = createDatabase()
    users = new UsersService(db.model as unknown as Model<User>)
    service = new PasswordResetService(
      users,
      mail as unknown as MailService,
      new ConfigService({ EMAIL_OTP_SECRET: secret }),
      passwords as unknown as PasswordService,
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  const authorize = async () => {
    await service.request(email)
    return service.verify(email, '012345')
  }

  it('sends a padded OTP, stores only a domain-separated HMAC and hides reset state by default', async () => {
    expect(await service.request(' AN@EXAMPLE.COM ')).toEqual({ message: PASSWORD_RESET_REQUEST_MESSAGE })
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(email, '012345')
    const challenge = db.current().passwordReset
    expect(challenge).toMatchObject({
      attemptsRemaining: 5,
      expiresAt: new Date(Date.now() + 600000),
      nextSendAt: new Date(Date.now() + 60000),
      codeHash: createHmac('sha256', secret)
        .update(`password-reset:${id}:${challenge.challengeId}:012345`)
        .digest('hex'),
    })
    expect(JSON.stringify(db.current())).not.toContain('012345')
    expect(UserSchema.path('passwordReset').options.select).toBe(false)
    expect(db.current().passwordHash).toBe('old-hash')
  })

  it('exchanges the OTP once for a hashed 32-byte reset token without changing password or login state', async () => {
    const grant = await authorize()
    expect(grant).toEqual({ resetToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expiresIn: 600 })
    expect(db.current().passwordReset).toMatchObject({
      resetTokenHash: createHash('sha256').update(grant.resetToken).digest('hex'),
      resetExpiresAt: new Date(Date.now() + 600000),
    })
    expect(db.current().passwordReset.codeHash).toBeUndefined()
    expect(JSON.stringify(db.current())).not.toContain(grant.resetToken)
    expect(db.current().passwordHash).toBe('old-hash')
    await expect(service.verify(email, '012345')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('atomically changes the password, consumes the token and bumps the version even for legacy users', async () => {
    const { resetToken } = await authorize()
    await expect(service.reset(email, resetToken, '  new password  ')).resolves.toHaveProperty('message')
    expect(passwords.hash).toHaveBeenCalledWith('  new password  ')
    expect(db.current()).toMatchObject({ passwordHash: 'new-password-hash', passwordVersion: 1, emailVerified: true })
    expect(db.current().passwordReset).toBeUndefined()
    expect(db.current().emailVerification).toEqual({ codeHash: 'registration-code-hash' })
    expect(mail.sendPasswordResetConfirmation).toHaveBeenCalledWith(email)
    await expect(service.reset(email, resetToken, 'other password')).rejects.toBeInstanceOf(BadRequestException)
    expect(db.current().passwordVersion).toBe(1)
    expect(mail.sendPasswordResetConfirmation).toHaveBeenCalledOnce()
  })

  it('allows one winner for simultaneous verification and reset requests', async () => {
    await service.request(email)
    const verified = await Promise.allSettled([service.verify(email, '012345'), service.verify(email, '012345')])
    expect(verified.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const winner = verified.find(result => result.status === 'fulfilled')
    if (winner?.status !== 'fulfilled') throw new Error('Expected an authorized reset')
    const results = await Promise.allSettled([
      service.reset(email, winner.value.resetToken, 'password one'),
      service.reset(email, winner.value.resetToken, 'password two'),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(db.current().passwordVersion).toBe(1)
  })

  it('caps concurrent wrong guesses at five and rejects even the right code afterward', async () => {
    await service.request(email)
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.verify(email, '999999')))
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(db.current().passwordReset.attemptsRemaining).toBe(0)
    await expect(service.verify(email, '012345')).rejects.toBeInstanceOf(BadRequestException)
    expect(db.current().passwordHash).toBe('old-hash')
  })

  it('allows a correct code on the final attempt', async () => {
    await service.request(email)
    for (let i = 0; i < 4; i++) await expect(service.verify(email, '999999')).rejects.toThrow()
    await expect(service.verify(email, '012345')).resolves.toHaveProperty('resetToken')
  })

  it('rejects OTP and reset token expiry at exactly ten minutes', async () => {
    await service.request(email)
    vi.advanceTimersByTime(600000)
    await expect(service.verify(email, '012345')).rejects.toThrow()
    const { resetToken } = await authorize()
    vi.advanceTimersByTime(600000)
    await expect(service.reset(email, resetToken, 'new password')).rejects.toThrow()
    expect(db.current().passwordHash).toBe('old-hash')
  })

  it('checks OTP expiration again in the final atomic authorization', async () => {
    await service.request(email)
    const authorizeReset = users.authorizePasswordReset.bind(users)
    vi.spyOn(users, 'authorizePasswordReset').mockImplementation((...args) => {
      vi.advanceTimersByTime(600000)
      return authorizeReset(...args)
    })
    await expect(service.verify(email, '012345')).rejects.toThrow()
    expect(db.current().passwordReset.resetTokenHash).toBeUndefined()
  })

  it('rejects token expiry during password hashing without consuming the grant', async () => {
    const { resetToken } = await authorize()
    passwords.hash.mockImplementation(async () => {
      vi.advanceTimersByTime(600000)
      return 'new-hash'
    })
    await expect(service.reset(email, resetToken, 'new password')).rejects.toThrow()
    expect(db.current().passwordHash).toBe('old-hash')
  })

  it('enforces cooldown atomically and invalidates old codes and grants on resend', async () => {
    const { resetToken } = await authorize()
    await service.request(email)
    expect(mail.sendPasswordReset).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(60000)
    random.mockReturnValue(654321)
    await Promise.all([service.request(email), service.request(email)])
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(2)
    await expect(service.reset(email, resetToken, 'new password')).rejects.toThrow()
    await expect(service.verify(email, '012345')).rejects.toThrow()
    await expect(service.verify(email, '654321')).resolves.toHaveProperty('resetToken')
  })

  it.each(['recordFailedPasswordReset', 'authorizePasswordReset'] as const)(
    'prevents an in-flight %s from modifying a replacement challenge',
    async method => {
      await service.request(email)
      const replace = async () => {
        vi.advanceTimersByTime(60000)
        random.mockReturnValue(654321)
        await service.request(email)
      }
      if (method === 'recordFailedPasswordReset') {
        const original = users.recordFailedPasswordReset.bind(users)
        vi.spyOn(users, method).mockImplementation(async (...args) => {
          await replace()
          return original(...args)
        })
      } else {
        const original = users.authorizePasswordReset.bind(users)
        vi.spyOn(users, method).mockImplementation(async (...args) => {
          await replace()
          return original(...args)
        })
      }
      await expect(service.verify(email, method === 'authorizePasswordReset' ? '012345' : '999999')).rejects.toThrow()
      expect(db.current().passwordReset.attemptsRemaining).toBe(5)
      expect(db.current().passwordReset.resetTokenHash).toBeUndefined()
    },
  )

  it('acknowledges unknown, cooldown and SMTP-failure cases identically without logging secrets', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const unknown = await service.request('unknown@example.com')
    mail.sendPasswordReset.mockRejectedValue(new Error(`SMTP_PASS=secret; OTP=012345; ${email}`))
    const failure = await service.request(email)
    const cooldown = await service.request(email)
    expect(unknown).toEqual(failure)
    expect(failure).toEqual(cooldown)
    expect(mail.sendPasswordReset).toHaveBeenCalledOnce()
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret|012345|an@example/)
    vi.advanceTimersByTime(60000)
    mail.sendPasswordReset.mockResolvedValue(undefined)
    await service.request(email)
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(2)
  })

  it('rejects absent accounts/challenges and wrong email/token without changing the password', async () => {
    await expect(service.verify(email, '012345')).rejects.toThrow()
    await expect(service.verify('unknown@example.com', '012345')).rejects.toThrow()
    const { resetToken } = await authorize()
    await expect(service.reset('unknown@example.com', resetToken, 'new password')).rejects.toThrow()
    await expect(service.reset(email, 'X'.repeat(43), 'new password')).rejects.toThrow()
    expect(db.current().passwordHash).toBe('old-hash')
    await expect(service.reset(email, resetToken, 'new password')).resolves.toHaveProperty('message')
  })

  it('does not bypass email verification for pending accounts', async () => {
    db.replace({ ...db.current(), emailVerified: false })
    const { resetToken } = await authorize()
    await service.reset(email, resetToken, 'new password')
    expect(db.current().emailVerified).toBe(false)
  })

  it('keeps the grant usable after a password-validation failure', async () => {
    const { resetToken } = await authorize()
    passwords.hash.mockRejectedValueOnce(new BadRequestException('invalid password'))
    await expect(service.reset(email, resetToken, 'bad')).rejects.toThrow('invalid password')
    expect(db.current().passwordHash).toBe('old-hash')
    await expect(service.reset(email, resetToken, 'new password')).resolves.toHaveProperty('message')
  })

  it('does not undo a successful reset or leak SMTP details if notification delivery fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const { resetToken } = await authorize()
    mail.sendPasswordResetConfirmation.mockRejectedValue(new Error('SMTP_PASS=secret'))
    await expect(service.reset(email, resetToken, 'new password')).resolves.toHaveProperty('message')
    expect(db.current().passwordVersion).toBe(1)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret')
  })

  it('propagates database failure without claiming delivery or sending mail', async () => {
    db.model.findOneAndUpdate.mockImplementationOnce(() => ({
      exec: async () => {
        throw new Error('database failed')
      },
    }))
    await expect(service.request(email)).rejects.toThrow('database failed')
    expect(mail.sendPasswordReset).not.toHaveBeenCalled()
  })
})
