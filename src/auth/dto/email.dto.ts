import { Transform } from 'class-transformer'
import { IsEmail, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class EmailDto {
  @ApiProperty({ example: 'an@example.com', format: 'email', maxLength: 254 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string
}
