import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type MovieDocument = HydratedDocument<Movie>

@Schema() // Đánh dấu đây là một bản thiết kế cho MongoDB
export class Movie {
  // @Prop() xác định đây là một thuộc tính trong DB

  @Prop({ required: true }) // Bắt buộc phải có
  title: string

  @Prop()
  description: string

  @Prop()
  releaseYear: number

  @Prop()
  director: string

  // Lưu ý: MongoDB sẽ tự tạo field '_id' cho em, nên không cần khai báo id ở đây
}

export const MovieSchema = SchemaFactory.createForClass(Movie)
