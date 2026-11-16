import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './modules/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false }));
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? process.env.APP_URL ?? 'http://localhost:8080').split(',').map((origin) => origin.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('JengaFlow API')
    .setDescription('Multi-tenant construction workforce, site operations and payroll API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }
  if (process.env.NODE_ENV === 'production') {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = process.env[key];
      if (!value || value.length < 48 || value.startsWith('REPLACE_')) throw new Error(key + ' must be set to a strong unique secret (48+ characters).');
    }
    if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.');
    if (!process.env.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID is required in production.');
    let runtimeDatabaseUser = process.env.DATABASE_USERNAME;
    if (!runtimeDatabaseUser && process.env.DATABASE_URL) {
      try { runtimeDatabaseUser = decodeURIComponent(new URL(process.env.DATABASE_URL).username); } catch { throw new Error('DATABASE_URL is invalid.'); }
    }
    if (!runtimeDatabaseUser || ['postgres', 'root'].includes(runtimeDatabaseUser.toLowerCase())) {
      throw new Error('Use a dedicated least-privilege DATABASE_USERNAME; do not run JengaFlow as postgres or root.');
    }
    if (!process.env.DATABASE_URL && !process.env.DATABASE_PASSWORD) throw new Error('DATABASE_PASSWORD is required for the runtime database role.');
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) throw new Error('Configure REDIS_URL or REDIS_HOST/REDIS_PORT for production.');
    if (process.env.REDIS_HOST && (!Number.isInteger(Number(process.env.REDIS_PORT ?? 6379)) || Number(process.env.REDIS_PORT ?? 6379) < 1 || Number(process.env.REDIS_PORT ?? 6379) > 65535)) throw new Error('REDIS_PORT must be a valid TCP port.');
    for (const key of ['SEAWEEDFS_ACCESS_KEY', 'SEAWEEDFS_SECRET_KEY', 'SEAWEEDFS_BUCKET']) {
      if (!process.env[key]) throw new Error(key + ' is required in production.');
    }
    if (!process.env.DATABASE_URL && !(process.env.DATABASE_HOST && process.env.DATABASE_USERNAME && process.env.DATABASE_NAME)) {
      throw new Error('Configure DATABASE_URL or DATABASE_HOST, DATABASE_USERNAME and DATABASE_NAME.');
    }
  }

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
