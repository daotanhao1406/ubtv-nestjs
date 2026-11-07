import { ApiProperty } from '@nestjs/swagger'
import { PASSWORD_RESET_REQUEST_MESSAGE } from '../constants/password-reset.constants'

export class PasswordResetRequestResponseDto {
  @ApiProperty({ example: PASSWORD_RESET_REQUEST_MESSAGE })
  message: string
}

export class PasswordResetVerificationResponseDto {
  @ApiProperty({ description: 'Use only for reset-password; keep in memory and never log it' })
  resetToken: string

  @ApiProperty({ example: 600, description: 'Reset token lifetime in seconds' })
  expiresIn: number
}

export class PasswordResetResponseDto {
  @ApiProperty({ example: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.' })
  message: string
}
