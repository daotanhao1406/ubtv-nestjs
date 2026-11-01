import { ConfigService } from '@nestjs/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSmtpOptions } from '../../config/smtp.config'
import { MailService } from '../../services/mail.service'

describe('MailService and SMTP options (mock transport only)', () => {
  const config = new ConfigService({
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'test-user',
    SMTP_PASS: 'test-password',
    MAIL_FROM: 'no-reply@example.com',
  })
  const transport = { sendMail: vi.fn() }
  const service = new MailService(config, transport)

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('sends Vietnamese text and HTML with the code and expiry, without user HTML interpolation', async () => {
    await service.sendEmailVerification('an@example.com', '012345')
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'UBTV', address: 'no-reply@example.com' },
        to: { address: 'an@example.com', name: '' },
        subject: 'UBTV - Xác thực địa chỉ email',
        text: expect.stringContaining('012345'),
        html: expect.stringContaining('012345'),
      }),
    )
    const message = transport.sendMail.mock.calls[0][0]
    expect(message.text).toContain('10 phút')
    expect(message.html).toContain('10 phút')
    expect(JSON.stringify(message)).not.toContain('test-password')
  })

  it('propagates transport failure to the auth delivery handler', async () => {
    transport.sendMail.mockRejectedValue(new Error('delivery failed'))
    await expect(service.sendEmailVerification('an@example.com', '012345')).rejects.toThrow('delivery failed')
  })

  it('sets finite timeouts and keeps SMTP logging disabled', () => {
    expect(createSmtpOptions(config)).toMatchObject({
      port: 587,
      secure: false,
      requireTLS: false,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      dnsTimeout: 10000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    })
  })

  it('requires STARTTLS in production when direct TLS is disabled', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(createSmtpOptions(config).requireTLS).toBe(true)
  })

  it('supports direct TLS without requiring STARTTLS', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const direct = new ConfigService({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      SMTP_USER: 'test-user',
      SMTP_PASS: 'test-password',
    })
    expect(createSmtpOptions(direct)).toMatchObject({ port: 465, secure: true, requireTLS: false })
  })
})
