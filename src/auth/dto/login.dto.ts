import { IsString, MinLength, ValidateBy } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { EmailDto } from './email.dto'

export class LoginDto extends EmailDto {
  @ApiProperty({
    example: 'MatKhauTest123!',
    format: 'password',
    minLength: 6,
    description: 'At least 6 characters, at most 72 UTF-8 bytes; whitespace is preserved',
  })
  @IsString()
  @MinLength(6)
  @ValidateBy({
    name: 'maxPasswordBytes',
    validator: {
      validate: value => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72,
      defaultMessage: () => 'password must not exceed 72 UTF-8 bytes',
    },
  })
  password: string
}
