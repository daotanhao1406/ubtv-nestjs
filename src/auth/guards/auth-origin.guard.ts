import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'

@Injectable()
export class AuthOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    if (request.method !== 'POST') return true
    const origin = request.get('Origin')
    const allowedOrigins = [this.config.getOrThrow<string>('FRONTEND_ORIGIN')]
    if (this.config.get<boolean>('SWAGGER_ENABLED') === true) {
      allowedOrigins.push(this.config.getOrThrow<string>('SWAGGER_ORIGIN'))
    }
    if (request.get('X-App-Request') !== '1' || !allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Invalid request origin or missing X-App-Request header')
    }
    return true
  }
}
