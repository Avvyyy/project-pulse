import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SearchService } from '../search/search.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly redis:   RedisService,
    private readonly search:  SearchService,
  ) {}

  @Get()
  async health() {
    const [pg, rd, es] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
      this.search.ping(),
    ]);

    const checks = {
      postgres:      pg.status === 'fulfilled' ? 'ok' : 'error',
      redis:         rd.status === 'fulfilled' ? 'ok' : 'error',
      elasticsearch: es.status === 'fulfilled' && (es.value === true) ? 'ok' : 'error',
    };

    const ok = Object.values(checks).every((v) => v === 'ok');

    return { status: ok ? 'ok' : 'degraded', checks };
  }
}
