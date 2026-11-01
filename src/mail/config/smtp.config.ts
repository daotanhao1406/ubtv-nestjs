import { ConfigService } from '@nestjs/config'
import type { SMTPTransportOptions } from 'nodemailer/lib/smtp-transport'

export function createSmtpOptions(config: ConfigService): SMTPTransportOptions {
  const secure = config.getOrThrow<boolean>('SMTP_SECURE')
  return {
    host: config.getOrThrow<string>('SMTP_HOST'),
    port: config.getOrThrow<number>('SMTP_PORT'),
    secure,
    requireTLS: !secure && config.getOrThrow<string>('NODE_ENV') === 'production',
    auth: {
      user: config.getOrThrow<string>('SMTP_USER'),
      pass: config.getOrThrow<string>('SMTP_PASS'),
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    dnsTimeout: 10000,
    logger: false,
    debug: false,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    disableFileAccess: true,
    disableUrlAccess: true,
  }
}
