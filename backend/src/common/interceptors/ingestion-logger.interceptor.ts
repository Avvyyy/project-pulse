import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class IngestionLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('IngestionLogger');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req   = context.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms     = Date.now() - start;
          const apiKey = req.apiKey;
          this.logger.log(
            `[INGEST] ${req.method} ${req.url} 202 ${ms}ms` +
            ` | key=${apiKey?.id ?? '-'}` +
            ` | service=${req.body?.service ?? '-'}` +
            ` | level=${req.body?.level ?? '-'}`,
          );
        },
        error: (err) => {
          const ms = Date.now() - start;
          this.logger.warn(
            `[INGEST] ${req.method} ${req.url} ${err.status ?? 500} ${ms}ms | ${err.message}`,
          );
        },
      }),
    );
  }
}
