import { create } from 'zustand';
import type { Incident, FrequencyPoint, PaginatedResponse } from '../types';
import { incidentsApi, type ListParams } from '../api/incidents';

interface IncidentState {
  list:            PaginatedResponse<Incident> | null;
  current:         Incident | null;
  frequency:       FrequencyPoint[];
  listLoading:     boolean;
  detailLoading:   boolean;
  error:           string | null;

  fetchList:    (params?: ListParams) => Promise<void>;
  fetchOne:     (id: string) => Promise<void>;
  fetchFrequency: (id: string) => Promise<void>;
  clearCurrent: () => void;
}

export const useIncidentStore = create<IncidentState>((set) => ({
  list:          null,
  current:       null,
  frequency:     [],
  listLoading:   false,
  detailLoading: false,
  error:         null,

  fetchList: async (params?) => {
    set({ listLoading: true, error: null });
    try {
      const data = await incidentsApi.list(params);
      set({ list: data, listLoading: false });
    } catch (e: any) {
      set({ error: e.message, listLoading: false });
    }
  },

  fetchOne: async (id) => {
    set({ detailLoading: true, error: null, current: null });
    try {
      const data = await incidentsApi.get(id);
      set({ current: data, detailLoading: false });
    } catch (e: any) {
      set({ error: e.message, detailLoading: false });
    }
  },

  fetchFrequency: async (id) => {
    try {
      const data = await incidentsApi.getFrequency(id);
      set({ frequency: data });
    } catch {
      set({ frequency: [] });
    }
  },

  clearCurrent: () => set({ current: null, frequency: [], error: null }),
}));
