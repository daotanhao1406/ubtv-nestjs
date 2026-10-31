import { IsNotEmpty, IsString, IsNumber, IsMongoId } from 'class-validator'

export class CreateEpisodeDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsNumber()
  chapter: number

  // @IsMongoId({ message: 'Movie ID không hợp lệ (phải là Mongo ObjectId)' }) // 👈 Validate ID
  // @IsNotEmpty()
  // movieId: string

  // CÁCH MỚI đổi tên sang movie luôn
  @IsMongoId()
  movie: string // Frontend gửi: { "director": "65a..." }

  // description là optional, không cần validate cũng được
}
