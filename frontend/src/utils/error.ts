import { AxiosError } from 'axios';

/**
 * Extracts a human-readable error message from an unknown caught value.
 * Handles Axios errors (with response body), native Error instances,
 * and arbitrary thrown values.
 */
export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (error instanceof AxiosError) {
    const serverMessage = error.response?.data?.error;
    if (typeof serverMessage === 'string') return serverMessage;
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}
