import { ApiProperty } from '@nestjs/swagger'
import { RESEND_VERIFICATION_MESSAGE } from '../constants/email-verification.constants'

export class AuthUserResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string

  @ApiProperty({ example: 'Nguyen An' })
  name: string

  @ApiProperty({ example: 'an@example.com', format: 'email' })
  email: string

  @ApiProperty({ example: true })
  emailVerified: boolean
}

export class RegistrationResponseDto extends AuthUserResponseDto {
  @ApiProperty({ example: false })
  emailVerified: boolean

  @ApiProperty({
    example: true,
    description: 'SMTP accepted the email; false means the pending account can request a resend',
  })
  verificationEmailSent: boolean
}

export class EmailVerificationResponseDto {
  @ApiProperty({ example: true })
  emailVerified: boolean

  @ApiProperty({ example: 'Email đã được xác thực. Bạn có thể đăng nhập.' })
  message: string
}

export class ResendVerificationResponseDto {
  @ApiProperty({ example: RESEND_VERIFICATION_MESSAGE })
  message: string
}

export class AccessTokenResponseDto {
  @ApiProperty({ description: 'Copy this value into Authorize to call /auth/me', example: '<access-token>' })
  accessToken: string

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds' })
  expiresIn: number

  @ApiProperty({ type: AuthUserResponseDto })
  user: AuthUserResponseDto
}

export class LogoutResponseDto {
  @ApiProperty({ example: 'Logged out' })
  message: string
}
