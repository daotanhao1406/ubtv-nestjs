import { Exclude, Expose } from 'class-transformer'

export class MovieResponseDto {
  // Dùng @Expose để chọn những cái muốn giữ lại
  // Hoặc dùng @Exclude để chọn những cái muốn bỏ đi

  _id: string
  title: string
  description: string
  releaseYear: number
  director: string

  @Exclude() // ❌ Yêu cầu loại bỏ trường này
  __v: number

  constructor(partial: Partial<MovieResponseDto>) {
    Object.assign(this, partial)
  }
}
