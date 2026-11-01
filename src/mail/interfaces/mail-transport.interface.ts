import type { SendMailOptions } from 'nodemailer'

export interface MailTransport {
  sendMail(message: SendMailOptions): Promise<unknown>
}
