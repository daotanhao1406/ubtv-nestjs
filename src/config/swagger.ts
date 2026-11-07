import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

export function setupSwagger(app: INestApplication, config: ConfigService): void {
  if (!config.getOrThrow<boolean>('SWAGGER_ENABLED')) return

  const documentConfig = new DocumentBuilder()
    .setTitle('UBTV API')
    .setDescription(
      'Test the UBTV authentication API. Register using your own email, get the six-digit OTP from your inbox, ' +
        'call verify-email, then log in and copy data.accessToken into Authorize (without the Bearer prefix). ' +
        'To reset a password, call forgot-password, verify-reset-password with the emailed code, ' +
        'then reset-password with data.resetToken and the new password. Log in again afterward. ' +
        'The browser manages the HttpOnly refresh cookie automatically. Swagger adds X-App-Request: 1 to requests. ' +
        'Open this page on the configured SWAGGER_ORIGIN so auth POST requests pass origin checks. ' +
        'Successful responses use { statusCode, message, data, timestamp }; errors use standard NestJS responses.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'accessToken')
    .addTag('Auth', 'Register, verify email, reset password, log in, refresh, log out and inspect the current user')
    .build()

  const document = SwaggerModule.createDocument(app, documentConfig)
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: '/docs-json',
    customSiteTitle: 'UBTV API Explorer',
    swaggerOptions: {
      withCredentials: true,
      persistAuthorization: false,
      // Keep the OpenAPI document local; the public validator is unnecessary here.
      validatorUrl: null,
      requestInterceptor: (request: { headers: Record<string, string> }) => {
        request.headers['X-App-Request'] = '1'
        return request
      },
    },
  })
}
