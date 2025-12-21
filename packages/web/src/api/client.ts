import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
});

// Request interceptor: Add JWT to Authorization header
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = localStorage.getItem('accessToken');

    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error: Error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Don't handle 401 for auth endpoints - let the component handle the error
    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/register');

    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    // If 401 error and we have a refresh token, try to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refreshToken');

      if (refreshToken) {
        try {
          // Try to refresh access token
          const response = await axios.post<{ accessToken: string }>(`${API_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken: newAccessToken } = response.data;

          // Update stored token
          localStorage.setItem('accessToken', newAccessToken);

          // Retry original request with new token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }

          return apiClient(originalRequest);
        } catch (refreshError) {
          // Refresh failed - clear tokens and redirect to login
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return Promise.reject(
            refreshError instanceof Error ? refreshError : new Error('Token refresh failed')
          );
        }
      }

      // No refresh token - redirect to login
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

const api = {
  get: async <T>(url: string): Promise<T> => {
    const response = await apiClient.get<T>(url);
    return response.data;
  },
  post: async <T>(url: string, data: unknown): Promise<T> => {
    const response = await apiClient.post<T>(url, data);
    return response.data;
  },
  put: async <T>(url: string, data: unknown): Promise<T> => {
    const response = await apiClient.put<T>(url, data);
    return response.data;
  },
  delete: async <T>(url: string): Promise<T> => {
    const response = await apiClient.delete<T>(url);
    return response.data;
  },
  upload: async <T>(url: string, formData: FormData): Promise<T> => {
    const response = await apiClient.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export default api;
