import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req    = context.switchToHttp().getRequest();
    const res    = context.switchToHttp().getResponse();
    const apiKey = req.apiKey;

    if (!apiKey) return true; // ApiKeyGuard handles missing key

    const limit   = apiKey.rateLimit ?? this.config.get<number>('rateLimit.defaultPerMinute', 1000);
    const { allowed, current } = await this.redis.checkRateLimit(apiKey.id, limit);

    res.setHeader('X-RateLimit-Limit',     limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));

    if (!allowed) {
      res.setHeader('Retry-After', '60');
      throw new HttpException(
        { message: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
