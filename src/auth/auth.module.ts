import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { MongooseModule } from '@nestjs/mongoose'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { UsersModule } from '../users/users.module'
import { AuthCookiesService } from './services/auth-cookies.service'
import { AuthController } from './controllers/auth.controller'
import { AuthService } from './services/auth.service'
import { AccessTokenGuard } from './guards/access-token.guard'
import { AuthOriginGuard } from './guards/auth-origin.guard'
import { PasswordService } from './services/password.service'
import { RefreshSessionsService } from './services/refresh-sessions.service'
import { RefreshSession, RefreshSessionSchema } from './schemas/refresh-session.schema'
import { createJwtOptions } from './config/jwt.config'
import { MailModule } from '../mail/mail.module'
import { EmailVerificationService } from './services/email-verification.service'

@Module({
  imports: [
    UsersModule,
    MailModule,
    MongooseModule.forFeature([{ name: RefreshSession.name, schema: RefreshSessionSchema }]),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: createJwtOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookiesService,
    PasswordService,
    RefreshSessionsService,
    EmailVerificationService,
    AuthOriginGuard,
    AccessTokenGuard,
    ThrottlerGuard,
  ],
  exports: [AccessTokenGuard, JwtModule],
})
export class AuthModule {}
