import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsString, Matches, Max, Min } from 'class-validator'

export class MovieIdDto {
  @ApiProperty({ example: '5d3ad84b2c465aa17fbb94de4f166985' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  movieId: string
}

export class LibraryListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50
}

export class LibraryMovieIdsResponseDto {
  @ApiProperty({ type: [String], example: ['5d3ad84b2c465aa17fbb94de4f166985'] })
  movieIds: string[]

  @ApiProperty({ example: 1 })
  page: number

  @ApiProperty({ example: 50 })
  pageSize: number

  @ApiProperty({ example: 1 })
  total: number

  @ApiProperty({ example: 1 })
  totalPages: number
}

export class FavoriteStatusResponseDto {
  @ApiProperty({ example: '5d3ad84b2c465aa17fbb94de4f166985' })
  movieId: string

  @ApiProperty({ example: true })
  isFavorite: boolean
}

export class WatchedResponseDto {
  @ApiProperty({ example: '5d3ad84b2c465aa17fbb94de4f166985' })
  movieId: string

  @ApiProperty({ example: '2026-11-12T00:00:00.000Z', format: 'date-time' })
  watchedAt: Date

  @ApiProperty({ example: '2027-05-12T00:00:00.000Z', format: 'date-time' })
  expiresAt: Date
}
