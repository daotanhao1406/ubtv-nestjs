import { ForbiddenException } from '@nestjs/common'

export function requireVerifiedEmail(user: { emailVerified?: boolean }): void {
  if (user.emailVerified !== true) {
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Email verification is required',
    })
  }
}
