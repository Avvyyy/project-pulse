import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuditInterceptor }    from './common/interceptors/audit.interceptor';
import { RedisService }        from './redis/redis.service';

const IP_RATE_LIMIT_PER_MIN = 300;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Emit structured logs; in production wire to a log aggregator.
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const config = app.get(ConfigService);
  const port   = config.get<number>('app.port', 8080);
  const env    = config.get<string>('app.env', 'development');

  // ── Startup secret validation ──────────────────────────────────────────────
  // Fail fast rather than run with default credentials in production.
  const adminSecret = config.get<string>('app.adminSecret', '');
  if (env === 'production' && adminSecret === 'admin-secret-change-in-production') {
    throw new Error(
      '[FATAL] ADMIN_SECRET is set to the default placeholder. ' +
      'Set a strong secret before running in production.',
    );
  }

  // ── Trust proxy (real IP behind Docker / nginx / load balancer) ───────────
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.set('trust proxy', 1);

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet({
    // API-only service — no HTML documents served here.
    contentSecurityPolicy: false,
  }));

  // ── Body limits ────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── IP rate limiting (outermost layer, before all guards) ─────────────────
  const redis = app.get(RedisService);
  app.use(async (req: any, res: any, next: () => void) => {
    try {
      const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
      const { allowed } = await redis.checkIpRateLimit(ip, IP_RATE_LIMIT_PER_MIN);
      if (!allowed) {
        res.status(429).json({
          success: false,
          error:   { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Slow down.' },
        });
        return;
      }
    } catch {
      // Redis unavailable — fail open to avoid breaking the service.
    }
    next();
  });

  // ── CORS ───────────────────────────────────────────────────────────────────
  const origins = config
    .get<string>('cors.allowedOrigins', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin:         origins,
    methods:        ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Key', 'X-Admin-Secret'],
    credentials:    false,
  });

  // ── Route prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Global validation pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:            true,   // strip unknown properties
      forbidNonWhitelisted: true,   // reject payloads with extra fields
      transform:            true,
      transformOptions:     { enableImplicitConversion: true },
    }),
  );

  // ── Global interceptors ───────────────────────────────────────────────────
  app.useGlobalInterceptors(new AuditInterceptor());

  // ── Uniform error shape ───────────────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(port, '0.0.0.0');
  console.log(`[${env}] Project Pulse API listening on :${port}`);
}

bootstrap();
