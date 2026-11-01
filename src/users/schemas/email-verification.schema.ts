import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

@Schema({ _id: false })
export class EmailVerification {
  @Prop({ type: String, required: true })
  challengeId: string

  @Prop({ type: String, required: true })
  codeHash: string

  @Prop({ type: Date, required: true })
  expiresAt: Date

  @Prop({ type: Number, required: true, min: 0, max: 5 })
  attemptsRemaining: number

  @Prop({ type: Date, required: true })
  nextSendAt: Date
}

export const EmailVerificationSchema = SchemaFactory.createForClass(EmailVerification)
