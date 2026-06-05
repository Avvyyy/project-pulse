import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { ApiKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis:  RedisService,
  ) {}

  async create(dto: CreateApiKeyDto): Promise<{ apiKey: ApiKey; fullKey: string }> {
    const raw     = randomBytes(32).toString('hex');
    const fullKey = `pk_${raw}`;
    const prefix  = `pk_${raw.slice(0, 8)}`;
    const hash    = this.sha256(fullKey);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name:      dto.name,
        keyHash:   hash,
        keyPrefix: prefix,
        rateLimit: dto.rateLimit ?? 1000,
        isActive:  true,
      },
    });

    this.logger.log(`API key created: ${apiKey.id} (${apiKey.name})`);
    return { apiKey, fullKey };
  }

  async validateKey(rawKey: string): Promise<ApiKey | null> {
    const hash = this.sha256(rawKey);

    // Fast path: Redis cache.
    const cached = await this.redis.getCachedApiKey(hash);
    if (cached) {
      const key = cached as ApiKey;
      if (!key.isActive || key.revokedAt) return null;
      return key;
    }

    // Slow path: Postgres.
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash: hash } });
    if (!key || !key.isActive || key.revokedAt) return null;

    await this.redis.cacheApiKey(hash, key);

    // Fire-and-forget last-used update.
    void this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch((err) => this.logger.warn(`lastUsedAt update failed: ${err.message}`));

    return key;
  }

  async revoke(id: string): Promise<void> {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('API key not found');

    await this.prisma.apiKey.update({
      where: { id },
      data:  { revokedAt: new Date(), isActive: false },
    });

    await this.redis.invalidateApiKey(key.keyHash);
    this.logger.log(`API key revoked: ${id}`);
  }

  findAll(): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  }

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
