import { apiClient } from './client';
import { User } from '@/types';

export interface RegisterRequest {
  email: string;
  password: string;
  baseLanguage: string;
  role?: 'learner' | 'operator';
}

export interface RegisterResponse {
  userId: string;
  email: string;
  role: 'learner' | 'operator';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export const authApi = {
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    const response = await apiClient.post<RegisterResponse>('/auth/register', data);
    return response.data;
  },

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/login', data);
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  async logout(refreshToken: string): Promise<void> {
    await apiClient.post('/auth/logout', { refreshToken });
  },
};
