import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { ConfigService } from '@nestjs/config'
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Match the callable CommonJS export.
import cookieParser = require('cookie-parser')
import { setupSwagger } from './config/swagger'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)

  app.use(cookieParser())
  app.enableCors({
    origin: [
      config.getOrThrow<string>('FRONTEND_ORIGIN'),
      ...(config.getOrThrow<boolean>('SWAGGER_ENABLED') ? [config.getOrThrow<string>('SWAGGER_ORIGIN')] : []),
    ],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Request'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true, // Tự động loại bỏ các trường không có trong DTO (chống rác)
      forbidNonWhitelisted: true, // (Tùy chọn) Báo lỗi luôn nếu gửi thừa trường
    }),
  )
  app.useGlobalInterceptors(new TransformInterceptor())
  setupSwagger(app, config)
  await app.listen(config.getOrThrow<number>('PORT'))
}

void bootstrap()
