import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createTransport } from 'nodemailer'
import { createSmtpOptions } from './config/smtp.config'
import { SMTP_TRANSPORT } from './constants/mail.constants'
import { MailService } from './services/mail.service'

@Module({
  providers: [
    {
      provide: SMTP_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createTransport(createSmtpOptions(config)),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
