import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req      = context.switchToHttp().getRequest();
    const provided = req.headers['x-admin-secret'] as string | undefined;
    const expected = this.config.get<string>('app.adminSecret', '');

    if (!provided || !this.safeEqual(provided, expected)) {
      const ip = req.ip ?? '-';
      this.logger.warn(`Admin auth failed | ip=${ip} | path=${req.url}`);
      throw new UnauthorizedException('Invalid admin secret');
    }

    return true;
  }

  /**
   * Constant-time string comparison — prevents timing-based secret enumeration.
   * Pads both buffers to the same length before comparing so the equal-length
   * short-circuit in timingSafeEqual can't be exploited via length probing.
   */
  private safeEqual(a: string, b: string): boolean {
    const padLen = Math.max(a.length, b.length, 32);
    const bufA   = Buffer.alloc(padLen);
    const bufB   = Buffer.alloc(padLen);
    bufA.write(a);
    bufB.write(b);
    return timingSafeEqual(bufA, bufB);
  }
}
