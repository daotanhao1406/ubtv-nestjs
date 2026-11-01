import type { Request } from 'express'

export interface AuthUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
}

export interface RegistrationResponse extends AuthUser {
  verificationEmailSent: boolean
}

export interface AccessTokenResponse {
  accessToken: string
  expiresIn: number
  user: AuthUser
}

export interface AuthResult {
  data: AccessTokenResponse
  refreshToken: string
  expiresAt: Date
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser
}
