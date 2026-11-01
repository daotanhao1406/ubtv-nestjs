import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { describe, expect, it } from 'vitest'
import { AuthOriginGuard } from '../../guards/auth-origin.guard'

describe('AuthOriginGuard', () => {
  const origin = 'http://localhost:5173'
  const guard = new AuthOriginGuard(new ConfigService({ FRONTEND_ORIGIN: origin }))
  const context = (method: string, source?: string, header?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          get: (name: string) => ({ Origin: source, 'X-App-Request': header })[name],
        }),
      }),
    }) as unknown as ExecutionContext

  it('accepts an exact configured origin and custom header', () => {
    expect(guard.canActivate(context('POST', origin, '1'))).toBe(true)
  })

  it.each([
    [undefined, '1'],
    ['null', '1'],
    ['http://localhost:5174', '1'],
    ['http://localhost:5173.evil.example', '1'],
    ['http://localhost:5173, https://evil.example', '1'],
    [origin, undefined],
    [origin, '0'],
  ])('rejects invalid origin/header (%s, %s)', (source, header) => {
    expect(() => guard.canActivate(context('POST', source, header))).toThrow(ForbiddenException)
  })

  it('does not require an Origin for read-only Bearer requests', () => {
    expect(guard.canActivate(context('GET'))).toBe(true)
  })

  it('allows only the explicit Swagger origin while Swagger is enabled', () => {
    const swaggerGuard = new AuthOriginGuard(
      new ConfigService({ FRONTEND_ORIGIN: origin, SWAGGER_ENABLED: true, SWAGGER_ORIGIN: 'http://localhost:3000' }),
    )
    expect(swaggerGuard.canActivate(context('POST', 'http://localhost:3000', '1'))).toBe(true)
    expect(swaggerGuard.canActivate(context('POST', origin, '1'))).toBe(true)
    expect(() => swaggerGuard.canActivate(context('POST', 'http://localhost:3001', '1'))).toThrow(ForbiddenException)
    expect(() => swaggerGuard.canActivate(context('POST', 'http://localhost:3000'))).toThrow(ForbiddenException)
    expect(() => swaggerGuard.canActivate(context('POST', undefined, '1'))).toThrow(ForbiddenException)
  })

  it('rejects the Swagger origin when Swagger is disabled', () => {
    const disabled = new AuthOriginGuard(
      new ConfigService({ FRONTEND_ORIGIN: origin, SWAGGER_ENABLED: false, SWAGGER_ORIGIN: 'http://localhost:3000' }),
    )
    expect(() => disabled.canActivate(context('POST', 'http://localhost:3000', '1'))).toThrow(ForbiddenException)
  })
})
