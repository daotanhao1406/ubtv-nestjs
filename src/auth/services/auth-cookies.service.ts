import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { CookieOptions, Request, Response } from 'express'
import { REFRESH_COOKIE_NAME } from '../constants/auth.constants'

@Injectable()
export class AuthCookiesService {
  constructor(private readonly config: ConfigService) {}

  read(request: Request): string | undefined {
    const token = request.cookies?.[REFRESH_COOKIE_NAME]
    return typeof token === 'string' ? token : undefined
  }

  set(response: Response, token: string, expiresAt: Date) {
    response.cookie(REFRESH_COOKIE_NAME, token, { ...this.options(), expires: expiresAt })
  }

  clear(response: Response) {
    response.clearCookie(REFRESH_COOKIE_NAME, this.options())
  }

  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/auth',
    }
  }
}
