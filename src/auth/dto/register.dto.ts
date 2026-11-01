import { Transform } from 'class-transformer'
import { IsString, Length } from 'class-validator'
import { LoginDto } from './login.dto'
import { ApiProperty } from '@nestjs/swagger'

export class RegisterDto extends LoginDto {
  @ApiProperty({ example: 'Nguyen An', minLength: 1, maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name: string
}
