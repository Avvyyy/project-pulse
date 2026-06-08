import axios from 'axios';

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

export const adminHeaders = () => ({
  'X-Admin-Secret': (import.meta as any).env?.VITE_ADMIN_SECRET ?? '',
});

export default client;
