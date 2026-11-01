import { ConflictException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { User, UserDocument } from '../schemas/user.schema'
import { EmailVerification } from '../schemas/email-verification.schema'

interface CreateUserInput {
  name: string
  email: string
  passwordHash: string
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  async create(input: CreateUserInput): Promise<UserDocument> {
    try {
      return await this.users.create({ ...input, email: input.email.trim().toLowerCase() })
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Email is already registered')
      throw error
    }
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash').exec()
  }

  async findById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null
    return this.users.findById(id).exec()
  }

  findForEmailVerification(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email: email.trim().toLowerCase() }).select('+emailVerification').exec()
  }

  claimEmailVerification(userId: string, challenge: EmailVerification, now: Date): Promise<UserDocument | null> {
    return this.users
      .findOneAndUpdate(
        {
          _id: userId,
          emailVerified: { $ne: true },
          $or: [
            { 'emailVerification.nextSendAt': { $lte: now } },
            { 'emailVerification.nextSendAt': { $exists: false } },
          ],
        },
        { $set: { emailVerification: challenge } },
        { new: true, runValidators: true },
      )
      .exec()
  }

  async confirmEmailVerification(userId: string, challenge: EmailVerification): Promise<boolean> {
    const now = new Date()
    const result = await this.users
      .updateOne(this.activeChallengeFilter(userId, challenge, now), {
        $set: { emailVerified: true, emailVerifiedAt: now },
        $unset: { emailVerification: 1 },
      })
      .exec()
    return result.modifiedCount === 1
  }

  async recordFailedEmailVerification(userId: string, challenge: EmailVerification): Promise<void> {
    // The challenge ID/hash prevents an in-flight old request from burning a new code's attempts.
    await this.users
      .updateOne(this.activeChallengeFilter(userId, challenge, new Date()), {
        $inc: { 'emailVerification.attemptsRemaining': -1 },
      })
      .exec()
  }

  private activeChallengeFilter(userId: string, challenge: EmailVerification, now: Date) {
    return {
      _id: userId,
      emailVerified: { $ne: true },
      'emailVerification.challengeId': challenge.challengeId,
      'emailVerification.codeHash': challenge.codeHash,
      'emailVerification.expiresAt': { $gt: now },
      'emailVerification.attemptsRemaining': { $gt: 0 },
    }
  }
}
