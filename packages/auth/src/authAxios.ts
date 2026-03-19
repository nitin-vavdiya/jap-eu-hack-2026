import axios, { type AxiosInstance } from 'axios';

const API_BASE = 'http://localhost:8000/api';

export function createAuthAxios(getToken: () => string): AxiosInstance {
  const instance = axios.create({ baseURL: API_BASE });

  instance.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return instance;
}
