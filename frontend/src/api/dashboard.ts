import client from './client';

export type Period = '24h' | '7d' | '30d';

export interface DashboardOverview {
  eventsThisPeriod: number;
  eventsPrevPeriod: number;
  errorsThisPeriod: number;
  errorsPrevPeriod: number;
  errorRate:        number;
  activeIncidents:  number;
  firingAlerts:     number;
  openErrorGroups:  number;
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
  firstSeenAt:     string;
  lastSeenAt:      string;
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
  period:          Period;
  generatedAt:     string;
  overview:        DashboardOverview;
  volumeTrend:     VolumePoint[];
  serviceHealth:   ServiceHealth[];
  topErrorGroups:  TopErrorGroup[];
  incidentSummary: IncidentSummary;
  topErrorTypes:   TopErrorType[];
}

export const dashboardApi = {
  get: (period: Period = '24h') =>
    client.get<DashboardData>('/dashboard', { params: { period } }).then((r) => r.data),
};
