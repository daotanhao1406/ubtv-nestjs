import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

@Schema({ _id: false })
export class PasswordReset {
  @Prop({ type: String, required: true })
  challengeId: string

  @Prop({ type: String })
  codeHash?: string

  @Prop({ type: Date, required: true })
  expiresAt: Date

  @Prop({ type: Number, required: true, min: 0, max: 5 })
  attemptsRemaining: number

  @Prop({ type: Date, required: true })
  nextSendAt: Date

  @Prop({ type: String })
  resetTokenHash?: string

  @Prop({ type: Date })
  resetExpiresAt?: Date
}

export const PasswordResetSchema = SchemaFactory.createForClass(PasswordReset)
