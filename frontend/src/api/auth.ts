import client from './client';

export interface User {
  id: string;
  email: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
}

export const authApi = {
  me: async (): Promise<{ user: User }> => {
    const response = await client.get('/auth/me');
    return response.data;
  },

  login: async (credentials: LoginCredentials): Promise<{ user: User }> => {
    const response = await client.post('/auth/login', credentials);
    return response.data;
  },

  signup: async (data: SignupData): Promise<{ user: User }> => {
    const response = await client.post('/auth/signup', data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await client.post('/auth/logout');
  },

  refresh: async (): Promise<void> => {
    await client.post('/auth/refresh');
  }
};
