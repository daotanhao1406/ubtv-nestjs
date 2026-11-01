import { BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { beforeAll, describe, expect, it } from 'vitest'
import { PasswordService } from '../../services/password.service'

describe('PasswordService (real bcryptjs)', () => {
  // Cheap work factor only in unit tests; runtime validation requires at least 10.
  const service = new PasswordService(new ConfigService({ BCRYPT_COST: 4 }))
  beforeAll(() => service.onModuleInit())

  it('salts hashes and verifies passwords without exposing plaintext', async () => {
    const password = 'a secure password'
    const hash = await service.hash(password)
    expect(hash).toMatch(/^\$2[ab]\$04\$/)
    expect(hash).not.toContain(password)
    expect(await service.hash(password)).not.toBe(hash)
    expect(await service.verify(password, hash)).toBe(true)
    expect(await service.verify('a wrong password', hash)).toBe(false)
    expect(await service.verify(password)).toBe(false)
  })

  it('preserves Unicode and whitespace', async () => {
    const password = '  Mật khẩu của tôi 🔐  '
    const hash = await service.hash(password)
    expect(await service.verify(password, hash)).toBe(true)
    expect(await service.verify(password.trim(), hash)).toBe(false)
  })

  it('accepts 72 bytes without truncation', async () => {
    const password = '🔐'.repeat(18)
    expect(await service.verify(password, await service.hash(password))).toBe(true)
  })

  it.each(['abcdef', '🔐'.repeat(6)])('hashes and verifies a six-character password', async password => {
    const hash = await service.hash(password)
    expect(await service.verify(password, hash)).toBe(true)
  })

  it.each(['short', 'a'.repeat(73), '🔐'.repeat(19)])('rejects invalid password length', async password => {
    await expect(service.hash(password)).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.verify(password, 'unused')).rejects.toBeInstanceOf(BadRequestException)
  })
})
