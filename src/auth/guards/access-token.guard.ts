import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UsersService } from '../../users/services/users.service'
import { AuthenticatedRequest } from '../interfaces/auth.interface'
import { requireVerifiedEmail } from '../utils/require-verified-email.util'

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const match = /^Bearer ([^\s]+)$/i.exec(request.get('Authorization') ?? '')
    if (!match) throw new UnauthorizedException('A Bearer access token is required')

    let payload: { sub?: unknown; exp?: unknown }
    try {
      payload = await this.jwt.verifyAsync(match[1], { algorithms: ['HS256'] })
      if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') throw new Error('Invalid claims')
    } catch {
      throw new UnauthorizedException('Invalid or expired access token')
    }
    const user = await this.users.findById(payload.sub as string)
    if (!user) throw new UnauthorizedException('Invalid or expired access token')
    requireVerifiedEmail(user)
    request.user = { id: user._id.toString(), name: user.name, email: user.email, emailVerified: true }
    return true
  }
}
