import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { MailService } from '../../mail/services/mail.service'
import { UsersService } from '../../users/services/users.service'
import {
  EMAIL_OTP_COOLDOWN_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_TTL_MS,
  RESEND_VERIFICATION_MESSAGE,
} from '../constants/email-verification.constants'

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name)

  constructor(
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async send(userId: string): Promise<boolean> {
    const now = new Date()
    const code = randomInt(0, 1000000).toString().padStart(6, '0')
    const challengeId = randomUUID()
    const user = await this.users.claimEmailVerification(
      userId,
      {
        challengeId,
        codeHash: this.hash(userId, challengeId, code),
        expiresAt: new Date(now.getTime() + EMAIL_OTP_TTL_MS),
        attemptsRemaining: EMAIL_OTP_MAX_ATTEMPTS,
        nextSendAt: new Date(now.getTime() + EMAIL_OTP_COOLDOWN_MS),
      },
      now,
    )
    if (!user) return false

    try {
      await this.mail.sendEmailVerification(user.email, code)
      return true
    } catch (error: unknown) {
      // SMTP errors may contain credentials, message content or recipient details.
      this.logger.warn(
        `Verification email delivery failed; the account remains pending verification (${this.deliveryFailureDetails(error)})`,
      )
      return false
    }
  }

  async resend(email: string): Promise<{ message: string }> {
    const user = await this.users.findForEmailVerification(email)
    if (user && user.emailVerified !== true) await this.send(user._id.toString())
    return { message: RESEND_VERIFICATION_MESSAGE }
  }

  async verify(email: string, code: string): Promise<{ emailVerified: true; message: string }> {
    const user = await this.users.findForEmailVerification(email)
    const challenge = user?.emailVerification
    if (
      !user ||
      user.emailVerified === true ||
      !challenge ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.attemptsRemaining <= 0
    ) {
      throw this.invalidCode()
    }

    const submitted = Buffer.from(this.hash(user._id.toString(), challenge.challengeId, code), 'hex')
    const expected = Buffer.from(challenge.codeHash, 'hex')
    if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
      await this.users.recordFailedEmailVerification(user._id.toString(), challenge)
      throw this.invalidCode()
    }
    if (!(await this.users.confirmEmailVerification(user._id.toString(), challenge))) throw this.invalidCode()
    return { emailVerified: true, message: 'Email đã được xác thực. Bạn có thể đăng nhập.' }
  }

  private hash(userId: string, challengeId: string, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('EMAIL_OTP_SECRET'))
      .update(`${userId}:${challengeId}:${code}`)
      .digest('hex')
  }

  private deliveryFailureDetails(error: unknown): string {
    if (typeof error !== 'object' || error === null) return 'code=UNKNOWN'

    // Only emit known protocol metadata, never the server response, message or stack.
    const codes = [
      'EAUTH',
      'ECONNECTION',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EDNS',
      'ESOCKET',
      'ETLS',
      'EPROTOCOL',
      'EENVELOPE',
      'EMESSAGE',
      'ESTREAM',
    ]
    const commands = [
      'CONN',
      'EHLO',
      'HELO',
      'STARTTLS',
      'AUTH PLAIN',
      'AUTH LOGIN',
      'AUTH XOAUTH2',
      'MAIL FROM',
      'RCPT TO',
      'DATA',
    ]
    const code =
      'code' in error && typeof error.code === 'string' && codes.includes(error.code) ? error.code : 'UNKNOWN'
    const command =
      'command' in error && typeof error.command === 'string' && commands.includes(error.command)
        ? error.command
        : 'UNKNOWN'
    const responseCode =
      'responseCode' in error &&
      typeof error.responseCode === 'number' &&
      Number.isInteger(error.responseCode) &&
      error.responseCode >= 100 &&
      error.responseCode <= 599
        ? error.responseCode
        : 'UNKNOWN'
    return `code=${code}; command=${command}; responseCode=${responseCode}`
  }

  private invalidCode(): BadRequestException {
    return new BadRequestException('Mã xác thực không hợp lệ, hết hạn hoặc đã hết lượt thử')
  }
}
