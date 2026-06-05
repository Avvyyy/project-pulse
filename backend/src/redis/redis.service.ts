import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis({
      host:               config.get<string>('redis.host', 'localhost'),
      port:               config.get<number>('redis.port', 6379),
      password:           config.get<string>('redis.password') || undefined,
      db:                 config.get<number>('redis.db', 0),
      lazyConnect:        true,
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (err) =>
      this.logger.error('Redis connection error', err.message),
    );
  }

  /**
   * Fixed-window rate limiter. Returns current count for this window.
   * Key format: rl:{keyId}:{60-second bucket}
   */
  async checkRateLimit(
    keyId: string,
    limitPerMinute: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const window = 60;
    const bucket = Math.floor(Date.now() / 1000 / window);
    const key    = `rl:${keyId}:${bucket}`;

    const pipeline = this.client.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, window * 2); // 2x window so the key outlives the window for inspection

    const results = await pipeline.exec();
    const current = (results?.[0]?.[1] as number) ?? 0;

    return { allowed: current <= limitPerMinute, current };
  }

  async cacheApiKey(hash: string, data: unknown, ttlSeconds = 300): Promise<void> {
    await this.client.setex(`apikey:${hash}`, ttlSeconds, JSON.stringify(data));
  }

  async getCachedApiKey(hash: string): Promise<unknown | null> {
    const raw = await this.client.get(`apikey:${hash}`);
    return raw ? JSON.parse(raw) : null;
  }

  async invalidateApiKey(hash: string): Promise<void> {
    await this.client.del(`apikey:${hash}`);
  }

  // ─── IP rate limit ─────────────────────────────────────────────────────────

  /** Fixed-window rate limiter keyed by IP address. */
  async checkIpRateLimit(
    ip: string,
    limitPerMinute: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const bucket = Math.floor(Date.now() / 60_000);
    const key    = `ip:rl:${ip}:${bucket}`;

    const pipeline = this.client.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, 120);

    const results = await pipeline.exec();
    const current = (results?.[0]?.[1] as number) ?? 0;
    return { allowed: current <= limitPerMinute, current };
  }

  // ─── Auth brute-force tracking ─────────────────────────────────────────────

  /** Records a failed API key authentication attempt for the given IP. */
  async recordFailedAuth(ip: string): Promise<void> {
    const bucket = Math.floor(Date.now() / 300_000); // 5-min window
    const key    = `auth:fail:${ip}:${bucket}`;
    const pipe   = this.client.pipeline();
    pipe.incr(key);
    pipe.expire(key, 900); // 15-min TTL
    await pipe.exec();
  }

  /** Returns true if the IP has exceeded the failed-auth threshold. */
  async isAuthBlocked(ip: string): Promise<boolean> {
    const bucket = Math.floor(Date.now() / 300_000);
    const key    = `auth:fail:${ip}:${bucket}`;
    const raw    = await this.client.get(key);
    return parseInt(raw ?? '0', 10) >= 20;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
