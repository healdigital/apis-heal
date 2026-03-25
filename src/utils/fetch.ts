// Utility for making HTTP requests with timeout and error handling

export interface FetchOptions {
  timeout?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const timeout = options.timeout ?? 30000; // 30s default
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: options.headers,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FetchError(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new FetchError(`HTTP ${response.status}: ${text}`, response.status, response.statusText);
  }

  return (await response.json()) as T;
}
