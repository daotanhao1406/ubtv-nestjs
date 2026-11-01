import { BadRequestException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Model } from 'mongoose'
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MailService } from '../../../mail/services/mail.service'
import { EmailVerification } from '../../../users/schemas/email-verification.schema'
import { User, UserSchema } from '../../../users/schemas/user.schema'
import { UsersService } from '../../../users/services/users.service'
import { RESEND_VERIFICATION_MESSAGE } from '../../constants/email-verification.constants'
import { EmailVerificationService } from '../../services/email-verification.service'

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
  emailVerifiedAt?: Date
  emailVerification?: EmailVerification
}

// Small in-memory MongoDB predicate/update simulator. No database or HTTP is opened.
// This checks the service's actual conditional queries, not MongoDB's implementation.
function createDatabase() {
  let user: StoredUser | null = { _id: id, email, emailVerified: false }
  const copy = () => structuredClone(user)
  const read = (key: string): unknown => {
    if (key.startsWith('emailVerification.')) return user?.emailVerification?.[key.split('.')[1]]
    return user?.[key]
  }
  const matches = (filter: Record<string, unknown>): boolean =>
    user !== null &&
    Object.entries(filter).every(([key, value]) => {
      if (key === '$or') return (value as Record<string, unknown>[]).some(matches)
      const actual = read(key)
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        return Object.entries(value).every(([operator, expected]) => {
          if (operator === '$ne') return actual !== expected
          if (operator === '$exists') return (actual !== undefined) === expected
          if (operator === '$gt') return Number(actual) > Number(expected)
          if (operator === '$lte') return Number(actual) <= Number(expected)
          throw new Error(`Unsupported test predicate ${operator}`)
        })
      }
      return actual === value
    })
  const update = (changes: Record<string, Record<string, unknown>>) => {
    if (changes.$set?.emailVerification) {
      user.emailVerification = structuredClone(changes.$set.emailVerification as EmailVerification)
    }
    if (changes.$set?.emailVerified === true) {
      user.emailVerified = true
      user.emailVerifiedAt = changes.$set.emailVerifiedAt as Date
    }
    if (changes.$unset?.emailVerification) delete user.emailVerification
    if (changes.$inc?.['emailVerification.attemptsRemaining']) {
      user.emailVerification.attemptsRemaining += Number(changes.$inc['emailVerification.attemptsRemaining'])
    }
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
  return {
    model,
    current: copy,
    replace: (replacement: StoredUser | null) => {
      user = replacement
    },
  }
}

describe('EmailVerificationService with conditional user updates', () => {
  let db: ReturnType<typeof createDatabase>
  let users: UsersService
  let service: EmailVerificationService
  const mail = { sendEmailVerification: vi.fn() }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))
    random.mockReturnValue(12345)
    mail.sendEmailVerification.mockResolvedValue(undefined)
    db = createDatabase()
    users = new UsersService(db.model as unknown as Model<User>)
    service = new EmailVerificationService(
      users,
      mail as unknown as MailService,
      new ConfigService({ EMAIL_OTP_SECRET: secret }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('sends a padded six-digit code and stores only a user/challenge-bound HMAC', async () => {
    expect(await service.send(id)).toBe(true)
    expect(random).toHaveBeenCalledWith(0, 1000000)
    expect(mail.sendEmailVerification).toHaveBeenCalledWith(email, '012345')
    const challenge = db.current().emailVerification
    expect(challenge).toMatchObject({
      attemptsRemaining: 5,
      expiresAt: new Date(Date.now() + 600000),
      nextSendAt: new Date(Date.now() + 60000),
    })
    expect(challenge.codeHash).toBe(
      createHmac('sha256', secret).update(`${id}:${challenge.challengeId}:012345`).digest('hex'),
    )
    expect(JSON.stringify(db.current())).not.toContain('012345')
    expect(db.model.findOneAndUpdate).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), {
      new: true,
      runValidators: true,
    })
  })

  it('atomically verifies once, records the timestamp and clears the whole challenge', async () => {
    await service.send(id)
    expect(await service.verify(email, '012345')).toMatchObject({ emailVerified: true })
    expect(db.current()).toMatchObject({ emailVerified: true, emailVerifiedAt: new Date() })
    expect(db.current().emailVerification).toBeUndefined()
    await expect(service.verify(email, '012345')).rejects.toBeInstanceOf(BadRequestException)
    expect(mail.sendEmailVerification).toHaveBeenCalledOnce()
  })

  it('permits only one winner for simultaneous valid verification requests', async () => {
    await service.send(id)
    const results = await Promise.allSettled([service.verify(email, '012345'), service.verify(email, '012345')])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  })

  it('caps incorrect attempts at five even under concurrency, then rejects the correct code', async () => {
    await service.send(id)
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.verify(email, '999999')))
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(db.current().emailVerification.attemptsRemaining).toBe(0)
    await expect(service.verify(email, '012345')).rejects.toBeInstanceOf(BadRequestException)
    expect(db.current().emailVerified).toBe(false)
  })

  it('allows a correct code after four incorrect attempts', async () => {
    await service.send(id)
    for (let i = 0; i < 4; i++)
      await expect(service.verify(email, '999999')).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.verify(email, '012345')).resolves.toMatchObject({ emailVerified: true })
  })

  it('rejects expiration at exactly ten minutes without relying on TTL deletion', async () => {
    await service.send(id)
    vi.advanceTimersByTime(600000)
    await expect(service.verify(email, '012345')).rejects.toBeInstanceOf(BadRequestException)
    expect(db.model.updateOne).not.toHaveBeenCalled()
    expect(db.current().emailVerified).toBe(false)
  })

  it('checks expiry again in the final atomic write', async () => {
    await service.send(id)
    const confirm = users.confirmEmailVerification.bind(users)
    vi.spyOn(users, 'confirmEmailVerification').mockImplementation((userId, challenge) => {
      vi.advanceTimersByTime(600000)
      return confirm(userId, challenge)
    })
    await expect(service.verify(email, '012345')).rejects.toBeInstanceOf(BadRequestException)
    expect(db.current().emailVerified).toBe(false)
  })

  it('enforces cooldown and allows only one concurrent resend to send a new code', async () => {
    await service.send(id)
    const first = db.current().emailVerification
    expect(await service.resend(email)).toEqual({ message: RESEND_VERIFICATION_MESSAGE })
    expect(mail.sendEmailVerification).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(60000)
    random.mockReturnValue(654321)
    await Promise.all([service.resend(email), service.resend(email)])
    expect(mail.sendEmailVerification).toHaveBeenCalledTimes(2)
    expect(db.current().emailVerification.challengeId).not.toBe(first.challengeId)
    await expect(service.verify(email, '012345')).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.verify(email, '654321')).resolves.toMatchObject({ emailVerified: true })
  })

  it('does not subtract attempts from a replacement challenge for an in-flight old wrong code', async () => {
    await service.send(id)
    const record = users.recordFailedEmailVerification.bind(users)
    vi.spyOn(users, 'recordFailedEmailVerification').mockImplementation(async (userId, oldChallenge) => {
      vi.advanceTimersByTime(60000)
      random.mockReturnValue(654321)
      await service.resend(email)
      return record(userId, oldChallenge)
    })
    await expect(service.verify(email, '999999')).rejects.toBeInstanceOf(BadRequestException)
    expect(db.current().emailVerification.attemptsRemaining).toBe(5)
  })

  it('does not verify an old correct code after a concurrent resend', async () => {
    await service.send(id)
    const confirm = users.confirmEmailVerification.bind(users)
    vi.spyOn(users, 'confirmEmailVerification').mockImplementation(async (userId, oldChallenge) => {
      vi.advanceTimersByTime(60000)
      random.mockReturnValue(654321)
      await service.resend(email)
      return confirm(userId, oldChallenge)
    })
    await expect(service.verify(email, '012345')).rejects.toBeInstanceOf(BadRequestException)
    expect(db.current().emailVerified).toBe(false)
    expect(db.current().emailVerification.attemptsRemaining).toBe(5)
  })

  it('acknowledges unknown, verified and cooldown accounts identically', async () => {
    const unknown = await service.resend('unknown@example.com')
    db.replace({ _id: id, email, emailVerified: true })
    const verified = await service.resend(email)
    db.replace({ _id: id, email, emailVerified: false })
    await service.send(id)
    const cooldown = await service.resend(email)
    expect(unknown).toEqual(verified)
    expect(verified).toEqual(cooldown)
    expect(mail.sendEmailVerification).toHaveBeenCalledOnce()
  })

  it('rejects unknown accounts and absent challenges without a write', async () => {
    await expect(service.verify('unknown@example.com', '012345')).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.verify(email, '012345')).rejects.toBeInstanceOf(BadRequestException)
    expect(db.model.updateOne).not.toHaveBeenCalled()
  })

  it('retains a pending account after SMTP failure and redacts SMTP errors from logs', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    mail.sendEmailVerification.mockRejectedValue(new Error('SMTP_PASS=secret; OTP=012345; an@example.com'))
    expect(await service.send(id)).toBe(false)
    expect(db.current().emailVerified).toBe(false)
    expect(db.current().emailVerification).toBeDefined()
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SMTP_PASS|012345|an@example/)
    vi.advanceTimersByTime(60000)
    mail.sendEmailVerification.mockResolvedValue(undefined)
    await expect(service.resend(email)).resolves.toEqual({ message: RESEND_VERIFICATION_MESSAGE })
    expect(mail.sendEmailVerification).toHaveBeenCalledTimes(2)
  })

  it('logs safe SMTP codes to distinguish authentication and recipient failures', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    mail.sendEmailVerification.mockRejectedValue(
      Object.assign(new Error('SMTP_PASS=secret; OTP=012345'), {
        code: 'EENVELOPE',
        command: 'RCPT TO',
        responseCode: 550,
        response: '550 an@example.com rejected; SMTP_PASS=secret',
        rejected: [email],
      }),
    )
    expect(await service.send(id)).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('code=EENVELOPE; command=RCPT TO; responseCode=550'))
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SMTP_PASS|012345|an@example/)
  })

  it.each([
    { code: 'SMTP_PASS=secret', command: 'RCPT TO an@example.com', responseCode: '012345' },
    { code: {}, command: {}, responseCode: 12345 },
    null,
    'SMTP_PASS=secret; OTP=012345',
  ])('redacts unexpected SMTP error metadata: %j', async error => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    mail.sendEmailVerification.mockRejectedValue(error)
    expect(await service.send(id)).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('code=UNKNOWN'))
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SMTP_PASS|012345|an@example|12345/)
  })

  it('does not hide database failures or send email when the claim fails', async () => {
    db.model.findOneAndUpdate.mockImplementationOnce(() => ({
      exec: async () => {
        throw new Error('database failed')
      },
    }))
    await expect(service.send(id)).rejects.toThrow('database failed')
    expect(mail.sendEmailVerification).not.toHaveBeenCalled()
  })

  it('hides the whole challenge and defines no user TTL index', () => {
    expect(UserSchema.path('emailVerification').options.select).toBe(false)
    expect(UserSchema.indexes().every(([, options]) => options.expireAfterSeconds === undefined)).toBe(true)
  })
})
