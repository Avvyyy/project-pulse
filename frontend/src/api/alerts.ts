import client, { adminHeaders } from './client';
import type { Alert, AlertTrigger, AlertCondition, PaginatedResponse } from '../types';

export interface ListAlertsParams {
  isActive?: boolean;
  service?:  string;
  page?:     number;
  limit?:    number;
}

export interface CreateAlertPayload {
  name:         string;
  description?: string;
  service?:     string;
  environment?: string;
  level?:       string;
  condition:    AlertCondition;
  isActive?:    boolean;
}

export interface UpdateAlertPayload extends Partial<Omit<CreateAlertPayload, 'condition'>> {
  condition?: AlertCondition;
}

export const alertsApi = {
  list: (params?: ListAlertsParams) =>
    client.get<PaginatedResponse<Alert>>('/alerts', { params }).then((r) => r.data),

  get: (id: string) =>
    client.get<Alert>(`/alerts/${id}`).then((r) => r.data),

  getTriggers: (id: string, params?: { page?: number; limit?: number }) =>
    client
      .get<PaginatedResponse<AlertTrigger>>(`/alerts/${id}/triggers`, { params })
      .then((r) => r.data),

  create: (data: CreateAlertPayload) =>
    client
      .post<Alert>('/alerts', data, { headers: adminHeaders() })
      .then((r) => r.data),

  update: (id: string, data: UpdateAlertPayload) =>
    client
      .patch<Alert>(`/alerts/${id}`, data, { headers: adminHeaders() })
      .then((r) => r.data),

  toggle: (id: string) =>
    client
      .post<Alert>(`/alerts/${id}/toggle`, {}, { headers: adminHeaders() })
      .then((r) => r.data),

  remove: (id: string) =>
    client.delete(`/alerts/${id}`, { headers: adminHeaders() }),

  resolveTrigger: (alertId: string, triggerId: string) =>
    client
      .post<AlertTrigger>(
        `/alerts/${alertId}/triggers/${triggerId}/resolve`,
        {},
        { headers: adminHeaders() },
      )
      .then((r) => r.data),
};
