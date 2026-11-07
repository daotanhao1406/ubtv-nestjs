import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthCookiesService } from '../../services/auth-cookies.service'
import { AuthController } from '../../controllers/auth.controller'
import { AuthService } from '../../services/auth.service'
import { AuthenticatedRequest } from '../../interfaces/auth.interface'
import { EmailVerificationService } from '../../services/email-verification.service'
import { PasswordResetService } from '../../services/password-reset.service'

describe('AuthController and refresh cookies', () => {
  const user = { id: '507f1f77bcf86cd799439011', name: 'An', email: 'an@example.com', emailVerified: true }
  const credentials = { email: user.email, password: 'a secure password' }
  const data = { user, accessToken: 'access-token', expiresIn: 900 }
  const result = { data, refreshToken: 'private-token', expiresAt: new Date('2030-01-01') }
  const auth = { register: vi.fn(), login: vi.fn(), refresh: vi.fn(), logout: vi.fn() }
  const cookies = new AuthCookiesService(new ConfigService({ NODE_ENV: 'production' }))
  const verification = { verify: vi.fn(), resend: vi.fn() }
  const passwordReset = { request: vi.fn(), verify: vi.fn(), reset: vi.fn() }
  const controller = new AuthController(
    auth as unknown as AuthService,
    cookies,
    verification as unknown as EmailVerificationService,
    passwordReset as unknown as PasswordResetService,
  )
  const response = { cookie: vi.fn(), clearCookie: vi.fn() }
  const res = response as unknown as Response
  const req = { cookies: { 'ubtv.refresh': 'old-token' } } as unknown as Request

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetAllMocks()
    auth.register.mockResolvedValue(user)
    auth.login.mockResolvedValue(result)
    auth.refresh.mockResolvedValue(result)
    auth.logout.mockResolvedValue({ message: 'Logged out' })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('registers without creating a login cookie', async () => {
    expect(await controller.register({ ...credentials, name: user.name })).toEqual(user)
    expect(response.cookie).not.toHaveBeenCalled()
  })

  it('verifies and resends without issuing tokens or setting cookies', async () => {
    verification.verify.mockResolvedValue({ emailVerified: true, message: 'verified' })
    verification.resend.mockResolvedValue({ message: 'acknowledged' })
    expect(await controller.verifyEmail({ email: user.email, code: '012345' })).toMatchObject({ emailVerified: true })
    expect(verification.verify).toHaveBeenCalledWith(user.email, '012345')
    expect(await controller.resendVerification({ email: user.email })).toEqual({ message: 'acknowledged' })
    expect(verification.resend).toHaveBeenCalledWith(user.email)
    expect(auth.login).not.toHaveBeenCalled()
    expect(response.cookie).not.toHaveBeenCalled()
  })

  it('sets the production cookie and excludes the refresh token from JSON', async () => {
    expect(await controller.login(credentials, res)).toEqual(data)
    expect(response.cookie).toHaveBeenCalledWith('ubtv.refresh', result.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth',
      expires: result.expiresAt,
    })
  })

  it('handles reset steps without logging in, and clears the cookie only after a successful reset', async () => {
    passwordReset.request.mockResolvedValue({ message: 'acknowledged' })
    passwordReset.verify.mockResolvedValue({ resetToken: 'grant', expiresIn: 600 })
    passwordReset.reset.mockResolvedValue({ message: 'password reset' })
    expect(await controller.forgotPassword({ email: user.email })).toEqual({ message: 'acknowledged' })
    expect(passwordReset.request).toHaveBeenCalledWith(user.email)
    expect(await controller.verifyResetPassword({ email: user.email, code: '012345' })).toEqual({
      resetToken: 'grant',
      expiresIn: 600,
    })
    expect(passwordReset.verify).toHaveBeenCalledWith(user.email, '012345')
    expect(response.clearCookie).not.toHaveBeenCalled()
    expect(await controller.resetPassword({ ...credentials, resetToken: 'grant' }, res)).toEqual({
      message: 'password reset',
    })
    expect(passwordReset.reset).toHaveBeenCalledWith(user.email, 'grant', credentials.password)
    expect(response.clearCookie).toHaveBeenCalledOnce()
    expect(response.cookie).not.toHaveBeenCalled()
    expect(auth.login).not.toHaveBeenCalled()
    response.clearCookie.mockClear()
    passwordReset.reset.mockRejectedValue(new Error('invalid grant'))
    await expect(controller.resetPassword({ ...credentials, resetToken: 'grant' }, res)).rejects.toThrow(
      'invalid grant',
    )
    expect(response.clearCookie).not.toHaveBeenCalled()
  })

  it('reads the refresh cookie and preserves the original expiration when replacing it', async () => {
    expect(await controller.refresh(req, res)).toEqual(data)
    expect(auth.refresh).toHaveBeenCalledWith('old-token')
    expect(response.cookie.mock.calls[0][2].expires).toEqual(result.expiresAt)
  })

  it('does not change cookies when refresh fails (including a concurrent losing refresh)', async () => {
    auth.refresh.mockRejectedValue(new UnauthorizedException())
    await expect(controller.refresh(req, res)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(response.cookie).not.toHaveBeenCalled()
    expect(response.clearCookie).not.toHaveBeenCalled()
  })

  it('returns the public identity attached by the guard', () => {
    expect(controller.me({ user } as AuthenticatedRequest)).toEqual(user)
  })

  it('revokes before clearing a cookie with matching attributes and no expiry/maxAge', async () => {
    expect(await controller.logout(req, res)).toEqual({ message: 'Logged out' })
    expect(auth.logout).toHaveBeenCalledWith('old-token')
    expect(response.clearCookie).toHaveBeenCalledWith('ubtv.refresh', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth',
    })
    auth.logout.mockRejectedValue(new Error('database unavailable'))
    response.clearCookie.mockClear()
    await expect(controller.logout(req, res)).rejects.toThrow('database unavailable')
    expect(response.clearCookie).not.toHaveBeenCalled()
  })

  it('supports local HTTP and ignores non-string/absent cookie values', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const local = new AuthCookiesService(new ConfigService({ NODE_ENV: 'development' }))
    local.set(res, 'token', result.expiresAt)
    expect(response.cookie.mock.calls[0][2].secure).toBe(false)
    expect(local.read({} as Request)).toBeUndefined()
    expect(local.read({ cookies: { 'ubtv.refresh': { token: 'ignored' } } } as unknown as Request)).toBeUndefined()
  })
})
