import { IsOptional, IsMongoId, IsString, IsNumber, IsDateString } from 'class-validator'
import { Type } from 'class-transformer'

export class FilterEpisodeDto {
  // 1. Filter theo Phim (MovieId)
  @IsOptional()
  @IsMongoId()
  movieId?: string

  // 2. Filter theo Chương (Tìm tập số 5 chẳng hạn)
  @IsOptional()
  @Type(() => Number) // Chuyển chuỗi query sang số
  @IsNumber()
  chapter?: number

  // 3. Tìm kiếm theo tên (Search text)
  @IsOptional()
  @IsString()
  name?: string

  // 4. Mốc thời gian (Từ ngày... Đến ngày...)
  // Giả sử Episode có trường 'airDate' (ngày lên sóng)
  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  // Pagination (Gộp luôn vào đây cho tiện)
  @IsOptional()
  @Type(() => Number)
  page?: number

  @IsOptional()
  @Type(() => Number)
  limit?: number
}
