import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { User } from '../../users/schemas/user.schema'

export type RefreshSessionDocument = HydratedDocument<RefreshSession>

@Schema({ timestamps: true })
export class RefreshSession {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId: Types.ObjectId

  @Prop({ type: String, required: true, unique: true })
  tokenHash: string

  @Prop({ type: Date, required: true })
  expiresAt: Date
}

export const RefreshSessionSchema = SchemaFactory.createForClass(RefreshSession)
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
