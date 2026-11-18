import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Types } from 'mongoose'

@Schema({ versionKey: false })
export class WatchedMovie {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId

  // Movie IDs belong to the external catalog; preserve them as opaque strings.
  @Prop({ type: String, required: true })
  movieId: string

  @Prop({ type: Date, required: true })
  watchedAt: Date

  @Prop({ type: Date, required: true })
  expiresAt: Date
}

export const WatchedMovieSchema = SchemaFactory.createForClass(WatchedMovie)

WatchedMovieSchema.index({ userId: 1, movieId: 1 }, { unique: true })
WatchedMovieSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
