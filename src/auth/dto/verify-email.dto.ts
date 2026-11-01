import { ApiProperty } from '@nestjs/swagger'
import { IsString, Matches } from 'class-validator'
import { EmailDto } from './email.dto'

export class VerifyEmailDto extends EmailDto {
  @ApiProperty({
    example: '012345',
    pattern: '^\\d{6}$',
    description: 'Six-digit code from your email; keep leading zeros',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a string containing exactly six digits' })
  code: string
}
