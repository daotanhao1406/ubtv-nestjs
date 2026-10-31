import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Tự động loại bỏ các trường không có trong DTO (chống rác)
      forbidNonWhitelisted: true, // (Tùy chọn) Báo lỗi luôn nếu gửi thừa trường
    }),
  )
  app.useGlobalInterceptors(new TransformInterceptor())
  await app.listen(process.env.PORT ?? 3000)
}

// https://github.com/pejmanhadavi/real-world-example-nestjs-mongoose-jwt-auth
bootstrap()
