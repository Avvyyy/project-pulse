import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { RedisService }   from '../../redis/redis.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly redis:          RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-api-key'] as string | undefined;
    const ip  = req.ip ?? 'unknown';

    if (!key) {
      throw new UnauthorizedException('Missing X-Api-Key header');
    }

    // Reject IPs that have exceeded the failed-auth threshold.
    if (await this.redis.isAuthBlocked(ip)) {
      this.logger.warn(`Blocked auth attempt from ${ip} (brute-force threshold exceeded)`);
      throw new HttpException(
        { message: 'Too many failed authentication attempts. Try again later.', code: 'AUTH_BLOCKED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const apiKey = await this.apiKeysService.validateKey(key);
    if (!apiKey) {
      // Record the failure regardless of whether the key exists to prevent
      // timing-based enumeration of valid key prefixes.
      await this.redis.recordFailedAuth(ip);
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    req.apiKey = apiKey;
    return true;
  }
}
