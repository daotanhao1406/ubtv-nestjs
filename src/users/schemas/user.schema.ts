import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { EmailVerification, EmailVerificationSchema } from './email-verification.schema'

export type UserDocument = HydratedDocument<User>

@Schema({ timestamps: true })
export class User {
  @Prop({ type: String, required: true, trim: true })
  name: string

  @Prop({ type: String, required: true, trim: true, lowercase: true, unique: true })
  email: string

  @Prop({ type: String, required: true, select: false })
  passwordHash: string

  @Prop({ type: Boolean, required: true, default: false })
  emailVerified: boolean

  @Prop({ type: Date })
  emailVerifiedAt?: Date

  // Hidden as a whole so OTP state cannot leak through ordinary user queries.
  @Prop({ type: EmailVerificationSchema, select: false })
  emailVerification?: EmailVerification
}

export const UserSchema = SchemaFactory.createForClass(User)
