import axios, { type AxiosInstance } from 'axios';
import { getApiBase } from './config';

export function createAuthAxios(getToken: () => string): AxiosInstance {
  const instance = axios.create({ baseURL: getApiBase() });

  instance.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Propagate or generate a request ID for end-to-end tracing
    if (!config.headers['X-Request-ID']) {
      config.headers['X-Request-ID'] =
        (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }

    return config;
  });

  return instance;
}
