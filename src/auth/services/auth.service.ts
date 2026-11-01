import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UsersService } from '../../users/services/users.service'
import { UserDocument } from '../../users/schemas/user.schema'
import { ACCESS_TOKEN_TTL_SECONDS } from '../constants/auth.constants'
import { AuthResult, AuthUser, RegistrationResponse } from '../interfaces/auth.interface'
import { LoginDto } from '../dto/login.dto'
import { RegisterDto } from '../dto/register.dto'
import { PasswordService } from './password.service'
import { RefreshSessionsService } from './refresh-sessions.service'
import { EmailVerificationService } from './email-verification.service'
import { requireVerifiedEmail } from '../utils/require-verified-email.util'

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly sessions: RefreshSessionsService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  async register(input: RegisterDto): Promise<RegistrationResponse> {
    const passwordHash = await this.passwords.hash(input.password)
    const user = await this.users.create({ name: input.name, email: input.email, passwordHash })
    const verificationEmailSent = await this.emailVerification.send(user._id.toString())
    return { ...this.toPublicUser(user), verificationEmailSent }
  }

  async login(input: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email)
    const matches = await this.passwords.verify(input.password, user?.passwordHash)
    if (!user || !matches) throw new UnauthorizedException('Invalid email or password')
    requireVerifiedEmail(user)
    const data = await this.issueAccessToken(user)
    const session = await this.sessions.create(user._id.toString())
    return { data, ...session }
  }

  async refresh(token?: string): Promise<AuthResult> {
    const session = await this.sessions.rotate(token)
    if (!session) throw new UnauthorizedException('Invalid or expired refresh token')
    const user = await this.users.findById(session.userId)
    if (!user) {
      await this.sessions.revoke(session.refreshToken)
      throw new UnauthorizedException('Invalid or expired refresh token')
    }
    if (user.emailVerified !== true) {
      await this.sessions.revoke(session.refreshToken)
      requireVerifiedEmail(user)
    }
    return { data: await this.issueAccessToken(user), refreshToken: session.refreshToken, expiresAt: session.expiresAt }
  }

  async logout(token?: string) {
    await this.sessions.revoke(token)
    return { message: 'Logged out' }
  }

  private async issueAccessToken(user: UserDocument) {
    return {
      accessToken: await this.jwt.signAsync({ sub: user._id.toString() }),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: this.toPublicUser(user),
    }
  }

  private toPublicUser(user: UserDocument): AuthUser {
    return { id: user._id.toString(), name: user.name, email: user.email, emailVerified: user.emailVerified === true }
  }
}
