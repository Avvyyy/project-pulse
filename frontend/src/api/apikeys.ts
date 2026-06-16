import client from './client';

export interface APIKey {
  id: string;
  name: string;
  rateLimitPerMinute: number;
  createdAt: string;
  fullKey?: string;
}

export const apiKeysApi = {
  list: async (): Promise<APIKey[]> => {
    const response = await client.get('/api-keys');
    return response.data;
  },

  create: async (data: { name: string; rateLimitPerMinute?: number }): Promise<APIKey> => {
    const response = await client.post('/api-keys', data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await client.delete(`/api-keys/${id}`);
  }
};
