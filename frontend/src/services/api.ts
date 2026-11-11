import axios from 'axios';
import { clearAuthToken, getAuthToken } from './storageService';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8001/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function registerUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

apiClient.interceptors.request.use((config) => {
  const url = config.url ?? '';
  const isAuthPublic =
    url.includes('/auth/login') || url.includes('/auth/register');

  if (!isAuthPublic) {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? '';
      const isLoginAttempt =
        url.includes('/auth/login') || url.includes('/auth/register');

      if (!isLoginAttempt) {
        clearAuthToken();
        if (unauthorizedHandler) {
          unauthorizedHandler();
        }
      }
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorShape {
  message: string;
  status?: number;
  detail?: string;
}

export function extractApiError(error: unknown): ApiErrorShape {
  if (axios.isAxiosError(error)) {
    const rawData = error.response?.data;
    let detail: string | undefined;

    if (typeof rawData === 'object' && rawData !== null && 'detail' in rawData) {
      const rawDetail = (rawData as { detail: unknown }).detail;
      if (typeof rawDetail === 'string') {
        detail = rawDetail;
      } else if (Array.isArray(rawDetail) && rawDetail.length > 0) {
        const first = rawDetail[0] as { msg?: unknown };
        detail = first?.msg ? String(first.msg) : JSON.stringify(rawDetail);
      } else if (rawDetail !== undefined && rawDetail !== null) {
        detail = String(rawDetail);
      }
    }

    return {
      message: detail ?? error.message ?? 'Network request failed.',
      status: error.response?.status,
      detail,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: 'An unexpected error occurred.' };
}
