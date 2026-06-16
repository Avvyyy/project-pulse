import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Alert, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface EvalResult {
  firing:  boolean;
  context: Record<string, unknown>;
}

type Condition = Record<string, unknown>;

@Injectable()
export class AlertEvaluatorService {
  private readonly logger = new Logger(AlertEvaluatorService.name);

  /** Prevents overlapping evaluation cycles. */
  private running = false;

  /**
   * Tracks the last-checked timestamp per alert for `new_error_group` alerts.
   * Keyed by alert ID. Resets on service restart (acceptable — worst case: a
   * duplicate trigger for already-seen groups on first boot).
   */
  private readonly lastChecked = new Map<string, Date>();

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateAll(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous evaluation still running — skipping cycle');
      return;
    }
    this.running = true;
    try {
      const alerts = await this.prisma.alert.findMany({ where: { isActive: true } });
      this.logger.debug(`Evaluating ${alerts.length} active alert(s)`);

      await Promise.allSettled(alerts.map((a) => this.evaluateOne(a)));
    } finally {
      this.running = false;
    }
  }

  private async evaluateOne(alert: Alert): Promise<void> {
    try {
      const cond = alert.condition as Condition;
      const result = await this.dispatch(alert, cond);

      const activeTrigger = await this.prisma.alertTrigger.findFirst({
        where:   { alertId: alert.id, resolvedAt: null },
        orderBy: { triggeredAt: 'desc' },
      });

      if (result.firing && !activeTrigger) {
        await this.prisma.alertTrigger.create({
          data: { alertId: alert.id, context: result.context as Prisma.JsonObject },
        });
        this.logger.log(`🔔 Alert fired: "${alert.name}"`);
      } else if (!result.firing && activeTrigger) {
        await this.prisma.alertTrigger.update({
          where: { id: activeTrigger.id },
          data:  { resolvedAt: new Date() },
        });
        this.logger.log(`✅ Alert auto-resolved: "${alert.name}"`);
      }
    } catch (err: any) {
      this.logger.error(`Evaluation failed for alert ${alert.id}: ${err.message}`);
    }
  }

  private dispatch(alert: Alert, cond: Condition): Promise<EvalResult> {
    switch (cond.type) {
      case 'threshold':
        return this.evaluateThreshold(alert, cond);
      case 'spike':
        return this.evaluateSpike(alert, cond);
      case 'recurrence':
        return this.evaluateRecurrence(alert, cond);
      case 'new_error_group':
        return this.evaluateNewErrorGroup(alert);
      default:
        this.logger.warn(`Unknown condition type "${cond.type}" on alert ${alert.id}`);
        return Promise.resolve({ firing: false, context: {} });
    }
  }

  // ─── Threshold ────────────────────────────────────────────────────────────
  //
  // Fire when the count of matching events in the last `windowSeconds` exceeds
  // `threshold`. Metric 'error_count' restricts to events with an error group.

  private async evaluateThreshold(alert: Alert, cond: Condition): Promise<EvalResult> {
    const windowSeconds = (cond.windowSeconds as number) ?? 300;
    const threshold     = (cond.threshold     as number) ?? 0;
    const metric        = (cond.metric        as string) ?? 'event_count';

    const since = new Date(Date.now() - windowSeconds * 1_000);
    const where: Prisma.EventWhereInput = { timestamp: { gte: since } };

    if (alert.service)     where.service     = alert.service;
    if (alert.environment) where.environment = alert.environment;
    if (alert.level)       where.level       = alert.level;
    if (metric === 'error_count') where.errorGroupId = { not: null };

    const count = await this.prisma.event.count({ where });

    return {
      firing:  count > threshold,
      context: { count, threshold, metric, window_seconds: windowSeconds },
    };
  }

  // ─── Spike ────────────────────────────────────────────────────────────────
  //
  // Fire when the current-window count is ≥ `multiplier` × the baseline count.
  // The current window is `windowSeconds` (default 300 s); the baseline is the
  // period immediately before, spanning `baselineWindowSeconds`.

  private async evaluateSpike(alert: Alert, cond: Condition): Promise<EvalResult> {
    const windowMs   = ((cond.windowSeconds   as number) ?? 300)  * 1_000;
    const baselineMs = ((cond.baselineWindowSeconds as number) ?? 3600) * 1_000;
    const multiplier =  (cond.multiplier      as number) ?? 3;

    const now           = Date.now();
    const currentStart  = new Date(now - windowMs);
    const baselineStart = new Date(now - baselineMs - windowMs);
    const baselineEnd   = new Date(now - windowMs);

    const base: Prisma.EventWhereInput = {};
    if (alert.service)     base.service     = alert.service;
    if (alert.environment) base.environment = alert.environment;
    if (alert.level)       base.level       = alert.level;

    const [current, baseline] = await Promise.all([
      this.prisma.event.count({ where: { ...base, timestamp: { gte: currentStart } } }),
      this.prisma.event.count({ where: { ...base, timestamp: { gte: baselineStart, lt: baselineEnd } } }),
    ]);

    const ratio  = baseline > 0 ? current / baseline : 0;
    const firing = baseline > 0 && ratio >= multiplier;

    return {
      firing,
      context: { current_count: current, baseline_count: baseline, ratio: +ratio.toFixed(2), multiplier },
    };
  }

  // ─── Recurrence ──────────────────────────────────────────────────────────
  //
  // Fire when at least one open error group matching the alert's filters was
  // seen more than once within the last `minutes` minutes.

  private async evaluateRecurrence(alert: Alert, cond: Condition): Promise<EvalResult> {
    const minutes = (cond.minutes as number) ?? 60;
    const since   = new Date(Date.now() - minutes * 60 * 1_000);

    const where: Prisma.ErrorGroupWhereInput = {
      lastSeenAt:      { gte: since },
      occurrenceCount: { gt: 1 },
      status:          'open',
    };
    if (alert.service)     where.service     = alert.service;
    if (alert.environment) where.environment = alert.environment;
    if (alert.level)       where.level       = alert.level;

    const count = await this.prisma.errorGroup.count({ where });

    return {
      firing:  count > 0,
      context: { recurring_group_count: count, minutes },
    };
  }

  // ─── New error group ──────────────────────────────────────────────────────
  //
  // Fire when a new error group matching the alert's filters was created since
  // the last evaluation. Uses an in-memory timestamp; a missed cycle may produce
  // a brief gap but will not double-fire.

  private async evaluateNewErrorGroup(alert: Alert): Promise<EvalResult> {
    const since = this.lastChecked.get(alert.id) ?? new Date(Date.now() - 60_000);
    this.lastChecked.set(alert.id, new Date());

    const where: Prisma.ErrorGroupWhereInput = { firstSeenAt: { gte: since } };
    if (alert.service)     where.service     = alert.service;
    if (alert.environment) where.environment = alert.environment;
    if (alert.level)       where.level       = alert.level;

    const groups = await this.prisma.errorGroup.findMany({
      where,
      select: { id: true, title: true },
      take:   10,
    });

    return {
      firing:  groups.length > 0,
      context: { new_group_count: groups.length, groups },
    };
  }
}
