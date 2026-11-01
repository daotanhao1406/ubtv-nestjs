import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SMTP_TRANSPORT } from '../constants/mail.constants'
import { MailTransport } from '../interfaces/mail-transport.interface'

@Injectable()
export class MailService {
  constructor(
    private readonly config: ConfigService,
    @Inject(SMTP_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  async sendEmailVerification(email: string, code: string): Promise<void> {
    await this.transport.sendMail({
      from: { name: 'UBTV', address: this.config.getOrThrow<string>('MAIL_FROM') },
      to: { address: email, name: '' },
      subject: 'UBTV - Xác thực địa chỉ email',
      text:
        `Mã xác thực email UBTV của bạn là: ${code}\n` +
        'Mã có hiệu lực trong 10 phút và chỉ sử dụng một lần.\n' +
        'Nếu bạn không tạo tài khoản UBTV, hãy bỏ qua email này.',
      html:
        '<p>Mã xác thực email UBTV của bạn là:</p>' +
        `<p><strong style="font-size:24px;letter-spacing:4px">${code}</strong></p>` +
        '<p>Mã có hiệu lực trong 10 phút và chỉ sử dụng một lần.</p>' +
        '<p>Nếu bạn không tạo tài khoản UBTV, hãy bỏ qua email này.</p>',
    })
  }
}
