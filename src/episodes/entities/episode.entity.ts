import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose' // Import Schema của Mongoose đổi tên để tránh trùng
import { Movie } from '../../movies/entities/movie.entity' // Import class Movie

export type EpisodeDocument = HydratedDocument<Episode>

@Schema({
  timestamps: true, // Tự động thêm createdAt, updatedAt
  // 👇 1. Bật tính năng: Khi chuyển sang JSON thì kèm theo các trường ảo
  // toJSON: { virtuals: true },
  // toObject: { virtuals: true },
})
export class Episode {
  @Prop({ required: true })
  name: string // Tên tập (VD: "Tập 1 - Khởi đầu")

  @Prop({ required: true })
  chapter: number // Số tập (1, 2, 3...)

  @Prop()
  description: string

  // 👇 ĐÂY LÀ CHÌA KHÓA LIÊN KẾT
  // 👇 2. Cột THẬT trong DB: Vẫn tên là movieId (để lưu ID)
  // 👇 Cách cũ (SQL style): movieId -> Cần Virtual mới ra movie
  // @Prop({
  //   type: MongooseSchema.Types.ObjectId,
  //   ref: Movie.name, // Tên model tham chiếu (phải khớp với Movie.name)
  //   required: true,
  // })
  // movieId: Movie // Lưu ID, nhưng kiểu dữ liệu TypeScript là Movie để tiện gợi ý code

  // 👇 CÁCH MỚI (Mongoose Style): Đặt tên là movie luôn!
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Movie.name })
  movie: Movie | string // Lưu ý: Type ở đây mình để là Class Movie để TS gợi ý code
}

export const EpisodeSchema = SchemaFactory.createForClass(Episode)

// 👇 3. Định nghĩa cột ẢO tên là 'movie'
// EpisodeSchema.virtual('movie', {
//   ref: 'Movie', // Tham chiếu sang bảng Movie
//   localField: 'movieId', // Dựa vào trường 'movieId' ở bảng này (Episode)
//   foreignField: '_id', // Để tìm cái '_id' bên bảng kia (Movie)
//   justOne: true, // Vì 1 tập chỉ thuộc 1 phim (One-to-One ở chiều này)
// })
