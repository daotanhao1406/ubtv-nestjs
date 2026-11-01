import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthController } from '../../controllers/auth.controller'

describe('auth route rate limits', () => {
  let storage: ThrottlerStorageService
  let guard: ThrottlerGuard
  const context = (route: keyof AuthController, ip = '127.0.0.1') =>
    ({
      getClass: () => AuthController,
      getHandler: () => AuthController.prototype[route],
      switchToHttp: () => ({
        getRequest: () => ({ ip, headers: {} }),
        getResponse: () => ({ header: vi.fn() }),
      }),
    }) as unknown as ExecutionContext

  beforeEach(async () => {
    vi.useFakeTimers()
    storage = new ThrottlerStorageService()
    guard = new ThrottlerGuard([{ ttl: 60000, limit: 10 }], storage, new Reflector())
    await guard.onModuleInit()
  })
  afterEach(() => {
    storage.onApplicationShutdown()
    vi.useRealTimers()
  })

  it.each(['login', 'register', 'verifyEmail'] as const)('limits %s to 10 requests/minute per IP', async route => {
    for (let i = 0; i < 10; i++) expect(await guard.canActivate(context(route))).toBe(true)
    await expect(guard.canActivate(context(route))).rejects.toMatchObject({ status: 429 })
    expect(await guard.canActivate(context(route, '127.0.0.2'))).toBe(true)
    await vi.advanceTimersByTimeAsync(61000)
    expect(await guard.canActivate(context(route))).toBe(true)
  })

  it('limits resend verification to 5 requests/minute/IP', async () => {
    for (let i = 0; i < 5; i++) expect(await guard.canActivate(context('resendVerification'))).toBe(true)
    await expect(guard.canActivate(context('resendVerification'))).rejects.toMatchObject({ status: 429 })
  })

  it('allows 60 refresh requests and keeps endpoint counters separate', async () => {
    for (let i = 0; i < 60; i++) expect(await guard.canActivate(context('refresh'))).toBe(true)
    await expect(guard.canActivate(context('refresh'))).rejects.toMatchObject({ status: 429 })
    expect(await guard.canActivate(context('login'))).toBe(true)
  })

  it.each(['me', 'logout'] as const)('does not apply login limits to %s', async route => {
    for (let i = 0; i < 65; i++) expect(await guard.canActivate(context(route))).toBe(true)
  })
})
