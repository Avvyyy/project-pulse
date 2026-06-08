export type IncidentStatus   = 'open' | 'investigating' | 'resolved';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type TimelineType     =
  | 'opened'
  | 'status_change'
  | 'comment'
  | 'error_linked'
  | 'resolved'
  | 'severity_change';

export interface IncidentTimeline {
  id:         string;
  incidentId: string;
  type:       TimelineType;
  message:    string;
  actor?:     string;
  occurredAt: string;
}

export interface ErrorGroup {
  id:              string;
  fingerprint:     string;
  service:         string;
  environment:     string;
  level:           string;
  title:           string;
  occurrenceCount: number;
  firstSeenAt:     string;
  lastSeenAt:      string;
  status:          'open' | 'resolved' | 'ignored';
  resolvedAt?:     string;
}

export interface IncidentErrorGroup {
  incidentId:   string;
  errorGroupId: string;
  linkedAt:     string;
  errorGroup:   ErrorGroup;
}

export interface Incident {
  id:          string;
  title:       string;
  description?: string;
  status:      IncidentStatus;
  severity:    IncidentSeverity;
  service?:    string;
  environment?: string;
  openedAt:    string;
  resolvedAt?: string;
  timeline?:   IncidentTimeline[];
  errorGroups?: IncidentErrorGroup[];
  _count?: {
    errorGroups: number;
    timeline:    number;
  };
}

export interface FrequencyPoint {
  bucket: string;
  level:  string;
  count:  number;
}

export interface PaginatedResponse<T> {
  total:   number;
  page:    number;
  limit:   number;
  results: T[];
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export type AlertConditionType = 'threshold' | 'spike' | 'recurrence' | 'new_error_group';

export interface ThresholdCondition {
  type:          'threshold';
  metric:        'error_count' | 'event_count';
  threshold:     number;
  windowSeconds: number;
}

export interface SpikeCondition {
  type:                  'spike';
  multiplier:            number;
  windowSeconds:         number;
  baselineWindowSeconds: number;
}

export interface RecurrenceCondition {
  type:    'recurrence';
  minutes: number;
}

export interface NewErrorGroupCondition {
  type: 'new_error_group';
}

export type AlertCondition =
  | ThresholdCondition
  | SpikeCondition
  | RecurrenceCondition
  | NewErrorGroupCondition;

export interface AlertTrigger {
  id:          string;
  alertId:     string;
  triggeredAt: string;
  resolvedAt?: string | null;
  context?:    Record<string, unknown> | null;
}

/** `triggers[0]` is the latest; included in list + detail responses. */
export interface Alert {
  id:          string;
  name:        string;
  description?: string;
  service?:    string | null;
  environment?: string | null;
  level?:      string | null;
  condition:   AlertCondition;
  isActive:    boolean;
  createdAt:   string;
  updatedAt:   string;
  triggers?:   AlertTrigger[];
  _count?: { triggers: number };
}

/** Derived state — computed from isActive + latest trigger. */
export type AlertState = 'firing' | 'ok' | 'paused';

export function alertState(alert: Alert): AlertState {
  if (!alert.isActive) return 'paused';
  const latest = alert.triggers?.[0];
  if (latest && !latest.resolvedAt) return 'firing';
  return 'ok';
}
