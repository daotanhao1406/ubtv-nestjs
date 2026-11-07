import { ApiProperty } from '@nestjs/swagger'
import { IsString, Matches } from 'class-validator'
import { LoginDto } from './login.dto'

export class ResetPasswordDto extends LoginDto {
  @ApiProperty({
    description: 'Single-use token returned after verifying the reset code',
    pattern: '^[A-Za-z0-9_-]{43}$',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  resetToken: string
}
