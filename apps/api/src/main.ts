import './load-env'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { GlobalExceptionFilter } from './common/filters/http-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api')
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new GlobalExceptionFilter())

  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173'
  app.enableCors({
    origin: corsOrigin.split(',').map((origin) => origin.trim()),
    credentials: true,
  })

  const port = process.env.PORT ?? 8000
  await app.listen(port)
  console.log(`API server running on http://localhost:${port}`)
}

bootstrap()
