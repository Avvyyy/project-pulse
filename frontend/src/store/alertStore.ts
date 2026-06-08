import { create } from 'zustand';
import type { Alert, AlertTrigger, PaginatedResponse } from '../types';
import { alertsApi, type ListAlertsParams } from '../api/alerts';

interface AlertState {
  list:          PaginatedResponse<Alert> | null;
  current:       Alert | null;
  triggers:      PaginatedResponse<AlertTrigger> | null;
  listLoading:   boolean;
  detailLoading: boolean;
  error:         string | null;

  fetchList:    (params?: ListAlertsParams) => Promise<void>;
  fetchOne:     (id: string) => Promise<void>;
  fetchTriggers:(id: string, page?: number) => Promise<void>;
  clearCurrent: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  list:          null,
  current:       null,
  triggers:      null,
  listLoading:   false,
  detailLoading: false,
  error:         null,

  fetchList: async (params?) => {
    set({ listLoading: true, error: null });
    try {
      const data = await alertsApi.list(params);
      set({ list: data, listLoading: false });
    } catch (e: any) {
      set({ error: e.message, listLoading: false });
    }
  },

  fetchOne: async (id) => {
    set({ detailLoading: true, error: null, current: null });
    try {
      const data = await alertsApi.get(id);
      set({ current: data, detailLoading: false });
    } catch (e: any) {
      set({ error: e.message, detailLoading: false });
    }
  },

  fetchTriggers: async (id, page = 0) => {
    try {
      const data = await alertsApi.getTriggers(id, { page, limit: 50 });
      set({ triggers: data });
    } catch {
      set({ triggers: null });
    }
  },

  clearCurrent: () => set({ current: null, triggers: null, error: null }),
}));
