import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { LoginDto } from '../../dto/login.dto'
import { RegisterDto } from '../../dto/register.dto'
import { VerifyEmailDto } from '../../dto/verify-email.dto'
import { EmailDto } from '../../dto/email.dto'

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
const valid = { name: '  Nguyen An  ', email: '  AN@EXAMPLE.COM  ', password: 'a secure password' }
const register = (value: unknown) => pipe.transform(value, { type: 'body', metatype: RegisterDto })
const login = (value: unknown) => pipe.transform(value, { type: 'body', metatype: LoginDto })

describe('auth DTO validation', () => {
  it('normalizes email and name while preserving the password exactly', async () => {
    expect(await register({ ...valid, password: '  a secure password  ' })).toEqual({
      name: 'Nguyen An',
      email: 'an@example.com',
      password: '  a secure password  ',
    })
  })

  it.each([
    { password: 'short' },
    { password: 'a'.repeat(73) },
    { password: '🔐'.repeat(19) },
    { password: 123456789012 },
    { email: 'invalid' },
    { email: ['an@example.com'] },
    { name: '   ' },
    { name: 'a'.repeat(101) },
    { role: 'admin' },
  ])('rejects invalid registration %j', async overrides => {
    await expect(register({ ...valid, ...overrides })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects a five-character password during login', async () => {
    await expect(login({ email: valid.email, password: 'short' })).rejects.toBeInstanceOf(BadRequestException)
  })

  it.each(['abcdef', '🔐'.repeat(6)])(
    'accepts six-character passwords during registration and login',
    async password => {
      await expect(register({ ...valid, password })).resolves.toMatchObject({ password })
      await expect(login({ email: valid.email, password })).resolves.toMatchObject({ password })
    },
  )

  it('accepts exactly 72 UTF-8 bytes and rejects truncation during login too', async () => {
    const password = '🔐'.repeat(18)
    await expect(login({ email: valid.email, password })).resolves.toMatchObject({ password })
    await expect(login({ email: valid.email, password: `${password}a` })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('keeps leading zeros in verification codes and normalizes the email', async () => {
    expect(
      await pipe.transform({ email: valid.email, code: '012345' }, { type: 'body', metatype: VerifyEmailDto }),
    ).toEqual({
      email: 'an@example.com',
      code: '012345',
    })
    expect(await pipe.transform({ email: valid.email }, { type: 'body', metatype: EmailDto })).toEqual({
      email: 'an@example.com',
    })
  })

  it.each([123456, '12345', '1234567', '12345a', ' 012345', null])('rejects a malformed OTP %j', async code => {
    await expect(
      pipe.transform({ email: valid.email, code }, { type: 'body', metatype: VerifyEmailDto }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
