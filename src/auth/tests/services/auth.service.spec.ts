import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Types } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserDocument } from '../../../users/schemas/user.schema'
import { UsersService } from '../../../users/services/users.service'
import { AuthService } from '../../services/auth.service'
import { PasswordService } from '../../services/password.service'
import { RefreshSessionsService } from '../../services/refresh-sessions.service'
import { EmailVerificationService } from '../../services/email-verification.service'

describe('AuthService', () => {
  const user = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    name: 'An',
    email: 'an@example.com',
    passwordHash: 'private-password-hash',
    emailVerified: true,
  } as UserDocument
  const publicUser = { id: user._id.toString(), name: user.name, email: user.email, emailVerified: true }
  const credentials = { email: user.email, password: 'a secure password' }
  const session = { refreshToken: 'private-refresh-token', expiresAt: new Date('2030-01-01') }
  const users = { create: vi.fn(), findByEmail: vi.fn(), findById: vi.fn() }
  const passwords = { hash: vi.fn(), verify: vi.fn() }
  const jwt = { signAsync: vi.fn() }
  const sessions = { create: vi.fn(), rotate: vi.fn(), revoke: vi.fn() }
  const emailVerification = { send: vi.fn() }
  const service = new AuthService(
    users as unknown as UsersService,
    passwords as unknown as PasswordService,
    jwt as unknown as JwtService,
    sessions as unknown as RefreshSessionsService,
    emailVerification as unknown as EmailVerificationService,
  )

  beforeEach(() => {
    vi.resetAllMocks()
    users.create.mockResolvedValue(user)
    users.findByEmail.mockResolvedValue(user)
    users.findById.mockResolvedValue(user)
    passwords.hash.mockResolvedValue('new-hash')
    passwords.verify.mockResolvedValue(true)
    jwt.signAsync.mockResolvedValue('access-token')
    sessions.create.mockResolvedValue(session)
    sessions.rotate.mockResolvedValue({ ...session, userId: user._id.toString() })
    emailVerification.send.mockResolvedValue(true)
  })

  it('registers using a password hash and only returns public fields', async () => {
    users.create.mockResolvedValue({ ...user, emailVerified: false, emailVerification: { codeHash: 'private' } })
    expect(await service.register({ ...credentials, name: user.name })).toEqual({
      ...publicUser,
      emailVerified: false,
      verificationEmailSent: true,
    })
    expect(emailVerification.send).toHaveBeenCalledWith(publicUser.id)
    expect(users.create).toHaveBeenCalledWith({ name: user.name, email: user.email, passwordHash: 'new-hash' })
    expect(passwords.hash).toHaveBeenCalledWith(credentials.password)
    expect(sessions.create).not.toHaveBeenCalled()
    expect(jwt.signAsync).not.toHaveBeenCalled()
  })

  it('keeps the newly created pending account when SMTP delivery fails', async () => {
    users.create.mockResolvedValue({ ...user, emailVerified: false })
    emailVerification.send.mockResolvedValue(false)
    expect(await service.register({ ...credentials, name: user.name })).toMatchObject({
      emailVerified: false,
      verificationEmailSent: false,
    })
    expect(users.create).toHaveBeenCalledOnce()
  })

  it('persists a refresh session before returning a successful login', async () => {
    expect(await service.login(credentials)).toEqual({
      data: { accessToken: 'access-token', expiresIn: 900, user: publicUser },
      ...session,
    })
    expect(passwords.verify).toHaveBeenCalledWith(credentials.password, user.passwordHash)
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: publicUser.id })
    expect(sessions.create).toHaveBeenCalledWith(publicUser.id)
    sessions.create.mockRejectedValue(new Error('storage failure'))
    await expect(service.login(credentials)).rejects.toThrow('storage failure')
  })

  it('uses the same login error for unknown email and wrong password', async () => {
    passwords.verify.mockResolvedValue(false)
    await expect(service.login(credentials)).rejects.toThrow('Invalid email or password')
    users.findByEmail.mockResolvedValue(null)
    await expect(service.login(credentials)).rejects.toThrow('Invalid email or password')
    expect(passwords.verify).toHaveBeenLastCalledWith(credentials.password, undefined)
    expect(sessions.create).not.toHaveBeenCalled()
  })

  it('checks the password before exposing the unverified-email error and issues no tokens', async () => {
    users.findByEmail.mockResolvedValue({ ...user, emailVerified: false })
    passwords.verify.mockResolvedValue(false)
    await expect(service.login(credentials)).rejects.toBeInstanceOf(UnauthorizedException)
    passwords.verify.mockResolvedValue(true)
    try {
      await service.login(credentials)
      throw new Error('Unverified user was allowed to log in')
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException)
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED', statusCode: 403 })
    }
    expect(jwt.signAsync).not.toHaveBeenCalled()
    expect(sessions.create).not.toHaveBeenCalled()
  })

  it('refreshes without extending the original expiry', async () => {
    const result = await service.refresh('old-token')
    expect(sessions.rotate).toHaveBeenCalledWith('old-token')
    expect(result.expiresAt).toEqual(session.expiresAt)
    expect(result.data).toEqual({ accessToken: 'access-token', expiresIn: 900, user: publicUser })
    expect(result.data).not.toHaveProperty('refreshToken')
  })

  it('rejects missing, expired or already consumed refresh tokens', async () => {
    sessions.rotate.mockResolvedValue(null)
    await expect(service.refresh()).rejects.toBeInstanceOf(UnauthorizedException)
    expect(jwt.signAsync).not.toHaveBeenCalled()
  })

  it('revokes the replacement token if its user has been deleted', async () => {
    users.findById.mockResolvedValue(null)
    await expect(service.refresh('old-token')).rejects.toBeInstanceOf(UnauthorizedException)
    expect(sessions.revoke).toHaveBeenCalledWith(session.refreshToken)
    expect(jwt.signAsync).not.toHaveBeenCalled()
  })

  it('rejects refresh for an unverified user and revokes the replacement refresh token', async () => {
    users.findById.mockResolvedValue({ ...user, emailVerified: false })
    await expect(service.refresh('old-token')).rejects.toBeInstanceOf(ForbiddenException)
    expect(sessions.revoke).toHaveBeenCalledWith(session.refreshToken)
    expect(jwt.signAsync).not.toHaveBeenCalled()
  })

  it('logs out only the presented session and tolerates a missing cookie', async () => {
    expect(await service.logout('current-token')).toEqual({ message: 'Logged out' })
    expect(sessions.revoke).toHaveBeenCalledWith('current-token')
    await expect(service.logout()).resolves.toEqual({ message: 'Logged out' })
  })
})
