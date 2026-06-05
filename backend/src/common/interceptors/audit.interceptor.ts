import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

const STATE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();

    if (!STATE_METHODS.has(req.method)) return next.handle();

    const start    = Date.now();
    const ip       = req.ip ?? '-';
    // Note: never log the actual secret value.
    const actor    = req.headers['x-admin-secret']
      ? '[admin]'
      : (req.apiKey?.name ?? '[unauthenticated]');

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.logger.log(
            `${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms` +
            ` | ip=${ip} | actor=${actor}`,
          );
        },
        error: (err) => {
          this.logger.warn(
            `${req.method} ${req.url} ${err.status ?? 500} ${Date.now() - start}ms` +
            ` | ip=${ip} | actor=${actor} | err=${err.message}`,
          );
        },
      }),
    );
  }
}
