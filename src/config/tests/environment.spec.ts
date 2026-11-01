import { describe, expect, it } from 'vitest'
import { validateEnvironment } from '../environment'

const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/unit-test',
  JWT_SECRET: 'unit-test-secret-with-at-least-32-bytes',
  JWT_ISSUER: 'test-api',
  JWT_AUDIENCE: 'test-web',
  FRONTEND_ORIGIN: 'http://localhost:5173',
  EMAIL_OTP_SECRET: 'a-distinct-unit-test-email-otp-secret-32-bytes',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'test-user',
  SMTP_PASS: 'test-password',
  MAIL_FROM: 'no-reply@example.com',
}

describe('environment validation', () => {
  it('uses defaults and converts numeric environment variables', () => {
    expect(validateEnvironment(valid)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      BCRYPT_COST: 12,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    })
    expect(validateEnvironment({ ...valid, BCRYPT_COST: '11', PORT: '4000' })).toMatchObject({
      BCRYPT_COST: 11,
      PORT: 4000,
    })
  })

  it.each(Object.keys(valid))('requires %s', key => {
    expect(() => validateEnvironment({ ...valid, [key]: undefined })).toThrow(key)
  })

  it.each([
    { JWT_SECRET: 'short' },
    { MONGODB_URI: 'https://example.com' },
    { FRONTEND_ORIGIN: 'not-a-url' },
    { FRONTEND_ORIGIN: 'http://localhost:5173/' },
    { FRONTEND_ORIGIN: 'http://localhost:5173/path' },
    { FRONTEND_ORIGIN: 'http://user:password@localhost:5173' },
    { FRONTEND_ORIGIN: 'ftp://localhost' },
    { NODE_ENV: 'other' },
    { NODE_ENV: 'production' },
    { BCRYPT_COST: '4' },
    { BCRYPT_COST: '16' },
    { BCRYPT_COST: '12.5' },
    { PORT: '0' },
    { PORT: '65536' },
  ])('rejects invalid configuration %j', overrides => {
    expect(() => validateEnvironment({ ...valid, ...overrides })).toThrow()
  })

  it('accepts production with an HTTPS origin', () => {
    expect(
      validateEnvironment({ ...valid, NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://app.example.com' }),
    ).toMatchObject({ NODE_ENV: 'production' })
  })

  it('enables Swagger locally using the configured API port', () => {
    expect(validateEnvironment({ ...valid, PORT: '4000' })).toMatchObject({
      SWAGGER_ENABLED: true,
      SWAGGER_ORIGIN: 'http://localhost:4000',
    })
  })

  it('disables Swagger by default in production and accepts an explicit development opt-out', () => {
    expect(
      validateEnvironment({ ...valid, NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://app.example.com' }),
    ).toMatchObject({ SWAGGER_ENABLED: false })
    expect(validateEnvironment({ ...valid, SWAGGER_ENABLED: 'false' })).toMatchObject({ SWAGGER_ENABLED: false })
  })

  it('requires an explicit HTTPS Swagger origin when enabled in production', () => {
    const production = {
      ...valid,
      NODE_ENV: 'production',
      FRONTEND_ORIGIN: 'https://app.example.com',
      SWAGGER_ENABLED: 'true',
    }
    expect(() => validateEnvironment(production)).toThrow('SWAGGER_ORIGIN')
    expect(() => validateEnvironment({ ...production, SWAGGER_ORIGIN: 'http://api.example.com' })).toThrow(
      'SWAGGER_ORIGIN',
    )
    expect(validateEnvironment({ ...production, SWAGGER_ORIGIN: 'https://api.example.com' })).toMatchObject({
      SWAGGER_ENABLED: true,
      SWAGGER_ORIGIN: 'https://api.example.com',
    })
  })

  it.each([
    { SWAGGER_ENABLED: 'yes' },
    { SWAGGER_ORIGIN: 'not-a-url' },
    { SWAGGER_ORIGIN: 'http://localhost:3000/docs' },
    { SWAGGER_ORIGIN: 'http://localhost:3000/' },
    { SWAGGER_ORIGIN: 'http://user:pass@localhost:3000' },
  ])('rejects malformed Swagger settings %j', overrides => {
    expect(() => validateEnvironment({ ...valid, ...overrides })).toThrow()
  })

  it('supports direct TLS SMTP on port 465', () => {
    expect(validateEnvironment({ ...valid, SMTP_PORT: '465', SMTP_SECURE: 'true' })).toMatchObject({
      SMTP_PORT: 465,
      SMTP_SECURE: true,
    })
  })

  it.each([
    { EMAIL_OTP_SECRET: 'short' },
    { EMAIL_OTP_SECRET: valid.JWT_SECRET },
    { SMTP_HOST: 'smtp://smtp.example.com' },
    { SMTP_HOST: 'user@smtp.example.com' },
    { SMTP_PORT: '0' },
    { SMTP_PORT: '65536' },
    { SMTP_PORT: '587.5' },
    { SMTP_SECURE: 'yes' },
    { MAIL_FROM: 'not-an-email' },
    { MAIL_FROM: 'UBTV <no-reply@example.com>' },
  ])('rejects invalid SMTP/OTP configuration %j', overrides => {
    expect(() => validateEnvironment({ ...valid, ...overrides })).toThrow()
  })
})
