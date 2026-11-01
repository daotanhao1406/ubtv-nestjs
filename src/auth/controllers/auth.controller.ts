import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { AuthCookiesService } from '../services/auth-cookies.service'
import { AuthService } from '../services/auth.service'
import { AuthenticatedRequest } from '../interfaces/auth.interface'
import { LoginDto } from '../dto/login.dto'
import { RegisterDto } from '../dto/register.dto'
import { AccessTokenGuard } from '../guards/access-token.guard'
import { AuthOriginGuard } from '../guards/auth-origin.guard'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import {
  AccessTokenResponseDto,
  AuthUserResponseDto,
  LogoutResponseDto,
  RegistrationResponseDto,
  EmailVerificationResponseDto,
  ResendVerificationResponseDto,
} from '../dto/auth-response.dto'
import { ApiAuthResponse } from '../decorators/api-auth-response.decorator'
import { EmailDto } from '../dto/email.dto'
import { VerifyEmailDto } from '../dto/verify-email.dto'
import { EmailVerificationService } from '../services/email-verification.service'

@ApiTags('Auth')
@Controller('auth')
@UseGuards(AuthOriginGuard, ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookiesService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register and send an email OTP; verify the email before logging in' })
  @ApiAuthResponse(
    201,
    RegistrationResponseDto,
    'Pending account created; verificationEmailSent=false allows a later resend',
  )
  @ApiConflictResponse({ description: 'Email is already registered' })
  @ApiBadRequestResponse({ description: 'Invalid input or unexpected fields' })
  @ApiForbiddenResponse({ description: 'Invalid Origin or missing X-App-Request header' })
  @ApiTooManyRequestsResponse({ description: '10 requests/minute/IP' })
  @ApiHeader({ name: 'X-App-Request', required: true, schema: { type: 'string', default: '1', enum: ['1'] } })
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  register(@Body() input: RegisterDto) {
    return this.auth.register(input)
  }

  @Post('verify-email')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify the email with a six-digit OTP; does not log in' })
  @ApiAuthResponse(200, EmailVerificationResponseDto, 'Email verified; call login next')
  @ApiBadRequestResponse({ description: 'Invalid input, incorrect/expired/used code or exhausted attempts' })
  @ApiForbiddenResponse({ description: 'Invalid Origin or missing X-App-Request header' })
  @ApiTooManyRequestsResponse({ description: '10 requests/minute/IP, with at most 5 incorrect attempts per code' })
  @ApiHeader({ name: 'X-App-Request', required: true, schema: { type: 'string', default: '1', enum: ['1'] } })
  verifyEmail(@Body() input: VerifyEmailDto) {
    return this.emailVerification.verify(input.email, input.code)
  }

  @Post('resend-verification')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Request another OTP; always returns a generic acknowledgement',
    description: 'At least 60 seconds between sends per account. A new code invalidates the previous code.',
  })
  @ApiAuthResponse(200, ResendVerificationResponseDto, 'Request acknowledged without revealing account status')
  @ApiBadRequestResponse({ description: 'Invalid email input' })
  @ApiForbiddenResponse({ description: 'Invalid Origin or missing X-App-Request header' })
  @ApiTooManyRequestsResponse({ description: '5 requests/minute/IP' })
  @ApiHeader({ name: 'X-App-Request', required: true, schema: { type: 'string', default: '1', enum: ['1'] } })
  resendVerification(@Body() input: EmailDto) {
    return this.emailVerification.resend(input.email)
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in and set the HttpOnly refresh cookie' })
  @ApiAuthResponse(
    200,
    AccessTokenResponseDto,
    'Copy data.accessToken into Authorize; refresh cookie is set automatically',
  )
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiForbiddenResponse({ description: 'Invalid Origin, missing X-App-Request header or EMAIL_NOT_VERIFIED' })
  @ApiTooManyRequestsResponse({ description: '10 requests/minute/IP' })
  @ApiHeader({ name: 'X-App-Request', required: true, schema: { type: 'string', default: '1', enum: ['1'] } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Body() input: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(input)
    this.cookies.set(response, result.refreshToken, result.expiresAt)
    return result.data
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh using the browser cookie; no Bearer token or body is needed',
    description: 'Log in first. The browser sends ubtv.refresh automatically; its value is not entered in Swagger.',
  })
  @ApiAuthResponse(200, AccessTokenResponseDto, 'New access token and rotated refresh cookie')
  @ApiUnauthorizedResponse({ description: 'Missing, expired or already used refresh token' })
  @ApiForbiddenResponse({ description: 'Invalid Origin, missing X-App-Request header or EMAIL_NOT_VERIFIED' })
  @ApiTooManyRequestsResponse({ description: '60 requests/minute/IP' })
  @ApiHeader({ name: 'X-App-Request', required: true, schema: { type: 'string', default: '1', enum: ['1'] } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(this.cookies.read(request))
    this.cookies.set(response, result.refreshToken, result.expiresAt)
    return result.data
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current user using a Bearer access token' })
  @ApiBearerAuth('accessToken')
  @ApiAuthResponse(200, AuthUserResponseDto, 'Current user')
  @ApiUnauthorizedResponse({ description: 'Missing/invalid/expired access token or deleted user' })
  @ApiForbiddenResponse({ description: 'EMAIL_NOT_VERIFIED' })
  @Header('Cache-Control', 'no-store')
  @SkipThrottle()
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthenticatedRequest) {
    return request.user
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Revoke the current refresh session and clear its cookie',
    description: 'Idempotent. Existing access tokens may remain valid for up to 15 minutes.',
  })
  @ApiAuthResponse(200, LogoutResponseDto, 'Refresh cookie cleared')
  @ApiForbiddenResponse({ description: 'Invalid Origin or missing X-App-Request header' })
  @ApiHeader({ name: 'X-App-Request', required: true, schema: { type: 'string', default: '1', enum: ['1'] } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @SkipThrottle()
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.logout(this.cookies.read(request))
    this.cookies.clear(response)
    return result
  }
}
