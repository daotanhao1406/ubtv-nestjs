import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { MailService } from '../../mail/services/mail.service'
import { UsersService } from '../../users/services/users.service'
import {
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_OTP_TTL_MS,
  PASSWORD_RESET_REQUEST_MESSAGE,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from '../constants/password-reset.constants'
import {
  PasswordResetRequestResponseDto,
  PasswordResetResponseDto,
  PasswordResetVerificationResponseDto,
} from '../dto/password-reset-response.dto'
import { PasswordService } from './password.service'

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name)

  constructor(
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
  ) {}

  async request(email: string): Promise<PasswordResetRequestResponseDto> {
    const user = await this.users.findForPasswordReset(email)
    if (user) {
      const now = new Date()
      const code = randomInt(0, 1000000).toString().padStart(6, '0')
      const challengeId = randomUUID()
      const claimed = await this.users.claimPasswordReset(
        user._id.toString(),
        {
          challengeId,
          codeHash: this.hashCode(user._id.toString(), challengeId, code),
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_OTP_TTL_MS),
          attemptsRemaining: PASSWORD_RESET_MAX_ATTEMPTS,
          nextSendAt: new Date(now.getTime() + PASSWORD_RESET_COOLDOWN_MS),
        },
        now,
      )
      if (claimed) {
        try {
          await this.mail.sendPasswordReset(claimed.email, code)
        } catch {
          // Never log SMTP errors: they can contain credentials, recipients and the OTP.
          this.logger.warn('Password reset email delivery failed; retry after the cooldown')
        }
      }
    }
    return { message: PASSWORD_RESET_REQUEST_MESSAGE }
  }

  async verify(email: string, code: string): Promise<PasswordResetVerificationResponseDto> {
    const user = await this.users.findForPasswordReset(email)
    const challenge = user?.passwordReset
    if (
      !user ||
      !challenge?.codeHash ||
      challenge.resetTokenHash ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.attemptsRemaining <= 0
    ) {
      throw this.invalidCode()
    }
    const submitted = Buffer.from(this.hashCode(user._id.toString(), challenge.challengeId, code), 'hex')
    const expected = Buffer.from(challenge.codeHash, 'hex')
    if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
      await this.users.recordFailedPasswordReset(user._id.toString(), challenge)
      throw this.invalidCode()
    }

    const resetToken = randomBytes(32).toString('base64url')
    const authorized = await this.users.authorizePasswordReset(
      user._id.toString(),
      challenge,
      this.hashToken(resetToken),
      new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
    )
    if (!authorized) throw this.invalidCode()
    return { resetToken, expiresIn: PASSWORD_RESET_TOKEN_TTL_MS / 1000 }
  }

  async reset(email: string, resetToken: string, password: string): Promise<PasswordResetResponseDto> {
    const passwordHash = await this.passwords.hash(password)
    if (!(await this.users.resetPassword(email, this.hashToken(resetToken), passwordHash))) {
      throw new BadRequestException('Token đặt lại mật khẩu không hợp lệ, hết hạn hoặc đã được sử dụng')
    }
    try {
      await this.mail.sendPasswordResetConfirmation(email.trim().toLowerCase())
    } catch {
      this.logger.warn('Password reset confirmation email delivery failed')
    }
    return { message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.' }
  }

  private hashCode(userId: string, challengeId: string, code: string): string {
    // Domain separation keeps reset codes independent of registration verification codes.
    return createHmac('sha256', this.config.getOrThrow<string>('EMAIL_OTP_SECRET'))
      .update(`password-reset:${userId}:${challengeId}:${code}`)
      .digest('hex')
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  private invalidCode(): BadRequestException {
    return new BadRequestException('Mã đặt lại mật khẩu không hợp lệ, hết hạn hoặc đã hết lượt thử')
  }
}
