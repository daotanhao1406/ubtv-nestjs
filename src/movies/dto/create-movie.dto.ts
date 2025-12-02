import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class CreateMovieDto {
  @IsString({ message: 'Movie name is required' })
  @IsNotEmpty({ message: 'Movie name is required' })
  title: string

  @IsString()
  @IsOptional()
  description?: string

  @IsNumber({}, { message: 'Release year must be a number' })
  @Min(1900, { message: 'Release year must be a number bigger than 1900' })
  releaseYear: number

  @IsString()
  @IsNotEmpty()
  director: string
}
