import client, { adminHeaders } from './client';
import type { Incident, FrequencyPoint, PaginatedResponse } from '../types';

export interface ListParams {
  status?:   string;
  severity?: string;
  service?:  string;
  page?:     number;
  limit?:    number;
}

export interface CreateIncidentPayload {
  title:        string;
  severity:     string;
  description?: string;
  service?:     string;
  environment?: string;
}

export interface UpdateIncidentPayload {
  status?:      string;
  severity?:    string;
  description?: string;
  actor?:       string;
}

export const incidentsApi = {
  list: (params?: ListParams) =>
    client
      .get<PaginatedResponse<Incident>>('/incidents', { params })
      .then((r) => r.data),

  get: (id: string) =>
    client.get<Incident>(`/incidents/${id}`).then((r) => r.data),

  getFrequency: (id: string) =>
    client.get<FrequencyPoint[]>(`/incidents/${id}/frequency`).then((r) => r.data),

  create: (data: CreateIncidentPayload) =>
    client
      .post<Incident>('/incidents', data, { headers: adminHeaders() })
      .then((r) => r.data),

  update: (id: string, data: UpdateIncidentPayload) =>
    client
      .patch<Incident>(`/incidents/${id}`, data, { headers: adminHeaders() })
      .then((r) => r.data),

  remove: (id: string) =>
    client.delete(`/incidents/${id}`, { headers: adminHeaders() }),

  addTimeline: (id: string, message: string, actor?: string) =>
    client
      .post(`/incidents/${id}/timeline`, { message, actor }, { headers: adminHeaders() })
      .then((r) => r.data),

  linkErrorGroup: (id: string, errorGroupId: string) =>
    client
      .post(`/incidents/${id}/error-groups`, { errorGroupId }, { headers: adminHeaders() })
      .then((r) => r.data),

  unlinkErrorGroup: (id: string, errorGroupId: string) =>
    client.delete(`/incidents/${id}/error-groups/${errorGroupId}`, {
      headers: adminHeaders(),
    }),
};
