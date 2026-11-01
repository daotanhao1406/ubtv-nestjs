import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { createHash, randomBytes } from 'node:crypto'
import { REFRESH_TOKEN_TTL_MS } from '../constants/auth.constants'
import { RefreshSession } from '../schemas/refresh-session.schema'

@Injectable()
export class RefreshSessionsService {
  constructor(@InjectModel(RefreshSession.name) private readonly sessions: Model<RefreshSession>) {}

  async create(userId: string) {
    const refreshToken = this.generateToken()
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    await this.sessions.create({ userId, tokenHash: this.hash(refreshToken), expiresAt })
    return { refreshToken, expiresAt }
  }

  async rotate(token: string) {
    if (!this.isValidToken(token)) return null
    const refreshToken = this.generateToken()
    // Compare-and-swap in one document: no transaction or replica set is needed.
    const session = await this.sessions
      .findOneAndUpdate(
        { tokenHash: this.hash(token), expiresAt: { $gt: new Date() } },
        { $set: { tokenHash: this.hash(refreshToken) } },
        { new: true },
      )
      .exec()
    if (!session) return null
    return { userId: session.userId.toString(), refreshToken, expiresAt: session.expiresAt }
  }

  async revoke(token?: string) {
    if (!this.isValidToken(token)) return
    await this.sessions.deleteOne({ tokenHash: this.hash(token) }).exec()
  }

  private generateToken() {
    return randomBytes(32).toString('base64url')
  }

  private isValidToken(token: unknown): token is string {
    return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }
}
