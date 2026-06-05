import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ─── Row types for $queryRaw ──────────────────────────────────────────────────

interface VolumeRow  { bucket: Date; total: number; errors: number; warns: number }
interface SvcRow     { service: string; events_total: number; errors_total: number }
interface SvcGrpRow  { service: string; open_groups: number }
interface ErrorTypeRow { errorType: string; count: number }
interface IncRow     { severity: string; status: string; count: number }

// ─── Public response shapes ───────────────────────────────────────────────────

export interface DashboardOverview {
  eventsThisPeriod:  number;
  eventsPrevPeriod:  number;
  errorsThisPeriod:  number;
  errorsPrevPeriod:  number;
  errorRate:         number;
  activeIncidents:   number;
  firingAlerts:      number;
  openErrorGroups:   number;
}

export interface VolumePoint {
  bucket: string;
  total:  number;
  errors: number;
  warns:  number;
}

export interface ServiceHealth {
  service:         string;
  eventsTotal:     number;
  errorsTotal:     number;
  errorRate:       number;
  openErrorGroups: number;
  status:          'healthy' | 'degraded' | 'critical';
}

export interface TopErrorGroup {
  id:              string;
  title:           string;
  service:         string;
  level:           string;
  occurrenceCount: number;
  lastSeenAt:      Date;
}

export interface IncidentSummary {
  open:             number;
  investigating:    number;
  resolvedInPeriod: number;
  bySeverity:       Record<string, number>;
}

export interface TopErrorType {
  errorType: string;
  count:     number;
}

export interface DashboardData {
  period:          '24h' | '7d' | '30d';
  generatedAt:     string;
  overview:        DashboardOverview;
  volumeTrend:     VolumePoint[];
  serviceHealth:   ServiceHealth[];
  topErrorGroups:  TopErrorGroup[];
  incidentSummary: IncidentSummary;
  topErrorTypes:   TopErrorType[];
}

// ─── Period config ────────────────────────────────────────────────────────────

type Period = '24h' | '7d' | '30d';

const PERIOD_CONFIG: Record<Period, { hours: number; truncUnit: string }> = {
  '24h': { hours:  24, truncUnit: 'hour' },
  '7d':  { hours: 168, truncUnit: 'day'  },
  '30d': { hours: 720, truncUnit: 'day'  },
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(period: Period): Promise<DashboardData> {
    const { hours, truncUnit } = PERIOD_CONFIG[period] ?? PERIOD_CONFIG['24h'];

    const now       = new Date();
    const since     = new Date(now.getTime() - hours * 3_600_000);
    const prevSince = new Date(now.getTime() - hours * 3_600_000 * 2);

    const [overview, volumeTrend, svcRows, svcGrpRows, topErrorGroups, incRows, topErrorTypes] =
      await Promise.all([
        this.getOverview(since, prevSince),
        this.getVolumeTrend(since, truncUnit),
        this.getServiceEvents(since),
        this.getServiceErrorGroups(),
        this.getTopErrorGroups(),
        this.getIncidentRows(since),
        this.getTopErrorTypes(since),
      ]);

    return {
      period,
      generatedAt:    now.toISOString(),
      overview,
      volumeTrend,
      serviceHealth:  this.mergeServiceHealth(svcRows, svcGrpRows),
      topErrorGroups,
      incidentSummary: this.buildIncidentSummary(incRows, since),
      topErrorTypes,
    };
  }

  // ─── Overview KPIs ────────────────────────────────────────────────────────

  private async getOverview(since: Date, prevSince: Date): Promise<DashboardOverview> {
    const [eventsNow, eventsPrev, errorsNow, errorsPrev, activeIncidents, firingAlerts, openGroups] =
      await Promise.all([
        this.prisma.event.count({ where: { timestamp: { gte: since } } }),
        this.prisma.event.count({ where: { timestamp: { gte: prevSince, lt: since } } }),
        this.prisma.event.count({ where: { timestamp: { gte: since }, level: 'error' } }),
        this.prisma.event.count({ where: { timestamp: { gte: prevSince, lt: since }, level: 'error' } }),
        this.prisma.incident.count({ where: { status: { in: ['open', 'investigating'] } } }),
        this.prisma.alertTrigger.count({ where: { resolvedAt: null } }),
        this.prisma.errorGroup.count({ where: { status: 'open' } }),
      ]);

    return {
      eventsThisPeriod:  eventsNow,
      eventsPrevPeriod:  eventsPrev,
      errorsThisPeriod:  errorsNow,
      errorsPrevPeriod:  errorsPrev,
      errorRate:         eventsNow > 0 ? errorsNow / eventsNow : 0,
      activeIncidents,
      firingAlerts,
      openErrorGroups:   openGroups,
    };
  }

  // ─── Volume trend ─────────────────────────────────────────────────────────

  private async getVolumeTrend(since: Date, truncUnit: string): Promise<VolumePoint[]> {
    const rows = await this.prisma.$queryRaw<VolumeRow[]>(Prisma.sql`
      SELECT
        date_trunc(${truncUnit}, timestamp)               AS bucket,
        COUNT(*)::int                                     AS total,
        COUNT(*) FILTER (WHERE level = 'error')::int      AS errors,
        COUNT(*) FILTER (WHERE level = 'warn')::int       AS warns
      FROM   events
      WHERE  timestamp >= ${since}
      GROUP  BY 1
      ORDER  BY 1 ASC
    `);

    return rows.map((r) => ({
      bucket: r.bucket.toISOString(),
      total:  Number(r.total),
      errors: Number(r.errors),
      warns:  Number(r.warns),
    }));
  }

  // ─── Service health ───────────────────────────────────────────────────────

  private async getServiceEvents(since: Date): Promise<SvcRow[]> {
    return this.prisma.$queryRaw<SvcRow[]>(Prisma.sql`
      SELECT
        service,
        COUNT(*)::int                            AS events_total,
        COUNT(*) FILTER (WHERE level = 'error')::int AS errors_total
      FROM   events
      WHERE  timestamp >= ${since}
      GROUP  BY service
      ORDER  BY events_total DESC
      LIMIT  25
    `);
  }

  private async getServiceErrorGroups(): Promise<SvcGrpRow[]> {
    return this.prisma.$queryRaw<SvcGrpRow[]>(Prisma.sql`
      SELECT service, COUNT(*)::int AS open_groups
      FROM   error_groups
      WHERE  status = 'open'
      GROUP  BY service
    `);
  }

  private mergeServiceHealth(svcRows: SvcRow[], grpRows: SvcGrpRow[]): ServiceHealth[] {
    const grpMap = new Map(grpRows.map((r) => [r.service, Number(r.open_groups)]));

    return svcRows.map((r) => {
      const eventsTotal     = Number(r.events_total);
      const errorsTotal     = Number(r.errors_total);
      const openErrorGroups = grpMap.get(r.service) ?? 0;
      const errorRate       = eventsTotal > 0 ? errorsTotal / eventsTotal : 0;

      const status: ServiceHealth['status'] =
        errorRate > 0.15 ? 'critical'
        : errorRate > 0.05 ? 'degraded'
        : 'healthy';

      return { service: r.service, eventsTotal, errorsTotal, errorRate, openErrorGroups, status };
    });
  }

  // ─── Top error groups ─────────────────────────────────────────────────────

  private async getTopErrorGroups(): Promise<TopErrorGroup[]> {
    return this.prisma.errorGroup.findMany({
      where:   { status: 'open' },
      orderBy: { occurrenceCount: 'desc' },
      take:    10,
      select:  { id: true, title: true, service: true, level: true, occurrenceCount: true, lastSeenAt: true },
    });
  }

  // ─── Incident summary ─────────────────────────────────────────────────────

  private async getIncidentRows(since: Date): Promise<IncRow[]> {
    return this.prisma.$queryRaw<IncRow[]>(Prisma.sql`
      SELECT
        severity,
        status,
        COUNT(*)::int AS count
      FROM incidents
      WHERE status IN ('open', 'investigating')
         OR (status = 'resolved' AND resolved_at >= ${since})
      GROUP BY severity, status
    `);
  }

  private buildIncidentSummary(rows: IncRow[], since: Date): IncidentSummary {
    let open = 0, investigating = 0, resolvedInPeriod = 0;
    const bySeverity: Record<string, number> = {};

    for (const r of rows) {
      const n = Number(r.count);
      if (r.status === 'open')           { open           += n; }
      if (r.status === 'investigating')  { investigating  += n; }
      if (r.status === 'resolved')       { resolvedInPeriod += n; }

      if (r.status !== 'resolved') {
        bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + n;
      }
    }

    return { open, investigating, resolvedInPeriod, bySeverity };
  }

  // ─── Top error types ──────────────────────────────────────────────────────

  private async getTopErrorTypes(since: Date): Promise<TopErrorType[]> {
    const rows = await this.prisma.$queryRaw<{ errortype: string; count: number }[]>(Prisma.sql`
      SELECT
        error_type  AS errortype,
        COUNT(*)::int AS count
      FROM   events
      WHERE  timestamp >= ${since}
        AND  error_type IS NOT NULL
      GROUP  BY error_type
      ORDER  BY count DESC
      LIMIT  10
    `);

    return rows.map((r) => ({ errorType: r.errortype, count: Number(r.count) }));
  }
}
