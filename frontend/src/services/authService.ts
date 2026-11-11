import { apiClient } from './api';
import type { ApiTokenResponse, ApiUserOut } from './mappers';
import { clearAuthToken, setAuthToken } from './storageService';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role?: string;
  monthly_income_target?: number;
}

export interface UpdateProfilePayload {
  name: string;
  email: string;
  role: string;
  monthly_income_target: number;
}

export interface UpdatePreferencesPayload {
  currency?: 'INR' | 'USD' | 'EUR';
  date_format?: 'DD/MM/YYYY' | 'DD MMM YYYY' | 'YYYY-MM-DD';
  theme?: 'dark' | 'light';
  compact_numbers?: boolean;
  show_health_score_breakdown?: boolean;
  budget_alerts_enabled?: boolean;
  goal_milestones_enabled?: boolean;
}

export const authService = {
  async register(payload: RegisterPayload): Promise<ApiTokenResponse> {
    const { data } = await apiClient.post<ApiTokenResponse>('/auth/register', payload);
    setAuthToken(data.access_token);
    return data;
  },

  async login(payload: LoginPayload): Promise<ApiTokenResponse> {
    const { data } = await apiClient.post<ApiTokenResponse>('/auth/login', payload);
    setAuthToken(data.access_token);
    return data;
  },

  async getMe(): Promise<ApiUserOut> {
    const { data } = await apiClient.get<ApiUserOut>('/auth/me');
    return data;
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<ApiUserOut> {
    const { data } = await apiClient.patch<ApiUserOut>('/auth/me', payload);
    return data;
  },

  async updatePreferences(payload: UpdatePreferencesPayload): Promise<ApiUserOut> {
    const { data } = await apiClient.patch<ApiUserOut>(
      '/auth/me/preferences',
      payload,
    );
    return data;
  },

  logout(): void {
    clearAuthToken();
  },
};
