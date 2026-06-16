import client from './client';
import type { Event, PaginatedResponse } from '../types';

export const searchApi = {
  getGroupEvents: (groupId: string, page = 1, limit = 5) =>
    client
      .get<PaginatedResponse<Event>>(`/search/groups/${groupId}/events`, {
        params: { page, limit },
      })
      .then((r) => r.data),
};
