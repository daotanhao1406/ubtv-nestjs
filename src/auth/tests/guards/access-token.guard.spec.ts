import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Types } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UsersService } from '../../../users/services/users.service'
import { createJwtOptions } from '../../config/jwt.config'
import { AccessTokenGuard } from '../../guards/access-token.guard'

const config = new ConfigService({
  JWT_SECRET: 'unit-test-secret-with-at-least-32-bytes',
  JWT_ISSUER: 'test-api',
  JWT_AUDIENCE: 'test-web',
})

describe('AccessTokenGuard (real JWT verification)', () => {
  const jwt = new JwtService(createJwtOptions(config))
  const users = { findById: vi.fn() }
  const guard = new AccessTokenGuard(jwt, users as unknown as UsersService)
  const id = '507f1f77bcf86cd799439011'
  const request = { get: vi.fn(), user: undefined, cookies: { accessToken: 'ignored' } }
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext

  beforeEach(() => {
    vi.resetAllMocks()
    request.user = undefined
    users.findById.mockResolvedValue({
      _id: new Types.ObjectId(id),
      name: 'An',
      email: 'an@example.com',
      emailVerified: true,
    })
  })

  it('accepts a valid Bearer JWT and attaches only public user fields', async () => {
    const token = await jwt.signAsync({ sub: id })
    const payload = jwt.decode(token)
    expect(payload.exp - payload.iat).toBe(900)
    request.get.mockReturnValue(`Bearer ${token}`)
    expect(await guard.canActivate(context)).toBe(true)
    expect(request.user).toEqual({ id, name: 'An', email: 'an@example.com', emailVerified: true })
  })

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer one two'])(
    'rejects a missing/malformed Bearer header',
    async header => {
      request.get.mockReturnValue(header)
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
      expect(users.findById).not.toHaveBeenCalled()
    },
  )

  it.each([
    { expiresIn: -1 },
    { issuer: 'wrong-api' },
    { audience: 'wrong-web' },
    { algorithm: 'HS384' as const },
    { secret: 'another-unit-test-secret-with-32-bytes' },
  ])('rejects invalid JWT verification options %j', async options => {
    const token = await jwt.signAsync({ sub: id }, options)
    request.get.mockReturnValue(`Bearer ${token}`)
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(users.findById).not.toHaveBeenCalled()
  })

  it('rejects malformed tokens and missing required claims', async () => {
    request.get.mockReturnValue('Bearer malformed-token')
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
    request.get.mockReturnValue(`Bearer ${await jwt.signAsync({ other: id })}`)
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
    const options = createJwtOptions(config)
    delete options.signOptions.expiresIn
    const noExpiryToken = await new JwtService(options).signAsync({ sub: id })
    request.get.mockReturnValue(`Bearer ${noExpiryToken}`)
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects a valid token if its user was deleted', async () => {
    request.get.mockReturnValue(`Bearer ${await jwt.signAsync({ sub: id })}`)
    users.findById.mockResolvedValue(null)
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects an unverified user even with a valid existing access token', async () => {
    request.get.mockReturnValue(`Bearer ${await jwt.signAsync({ sub: id })}`)
    users.findById.mockResolvedValue({ _id: new Types.ObjectId(id), emailVerified: false })
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
    expect(request.user).toBeUndefined()
  })
})
