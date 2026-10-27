export const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

/** Build a backend URL, optionally pointing at the in-cluster address on the server. */
export function backendUrl(path: string): string {
  const base =
    (typeof window === 'undefined' && process.env.API_INTERNAL_URL
      ? process.env.API_INTERNAL_URL
      : API_BASE
    ).replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Fetch JSON from the backend with a sane timeout and error shape. */
export async function fetchJson<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 20000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(backendUrl(path), {
      ...rest,
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const detail =
        (body && typeof body === 'object' && 'detail' in body
          ? String((body as Record<string, unknown>).detail)
          : '') || res.statusText;
      throw new Error(`API ${res.status}: ${detail}`);
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}
