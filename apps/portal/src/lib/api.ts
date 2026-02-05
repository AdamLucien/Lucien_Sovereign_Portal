import type { ApiError } from '@lucien/contracts';

export class ApiResponseError extends Error {
  status: number;
  payload?: ApiError | unknown;

  constructor(status: number, message: string, payload?: ApiError | unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : undefined;

  if (!response.ok) {
    throw new ApiResponseError(response.status, response.statusText, payload);
  }

  return payload as T;
}
