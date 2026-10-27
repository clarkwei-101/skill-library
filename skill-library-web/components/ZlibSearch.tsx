'use client';

import { useEffect, useState } from 'react';
import type { ZlibSearchResponse } from '@/lib/types';

interface CookieInfo {
  has_cookies: boolean;
  logged_in: boolean;
  message: string;
}

export default function ZlibSearch() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [data, setData] = useState<ZlibSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cookie, setCookie] = useState<CookieInfo | null>(null);

  // Cookie / session status of the zlib deployment.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/zlib/cookie', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as CookieInfo;
        if (!cancelled) setCookie(body);
      } catch {
        /* cookie status is optional context */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    setSubmitted(q);
    setError('');

    if (!q) {
      // An empty query still returns the guidance document.
      setLoading(true);
      try {
        const res = await fetch('/api/zlib/search?q=', { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`);
        setData(body as ZlibSearchResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/zlib/search?q=${encodeURIComponent(q)}`, {
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`);
      setData(body as ZlibSearchResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const links = data?.links ?? [];
  const guidance = data?.guidance;

  return (
    <div className="zlib-search">
      <form className="zlib-search__bar" onSubmit={search}>
        <svg
          className="zlib-search__icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Z-Library by book title or author…"
          aria-label="Search query"
        />
        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : 'Search'}
        </button>
      </form>

      {cookie && (
        <div className={`cookie-status ${cookie.logged_in ? 'is-ok' : 'is-warn'}`}>
          <span className="cookie-status__dot" aria-hidden="true" />
          <span>{cookie.message}</span>
        </div>
      )}

      {submitted && !loading && !error && (
        <p className="zlib-search__summary">
          {links.length} mirror{links.length === 1 ? '' : 's'} ready
          {data?.scraped === false ? ' — this service returns links, not scraped results' : ''}
        </p>
      )}

      {error && <p className="zlib-search__error">{error}</p>}

      {links.length > 0 && (
        <ul className="result-list">
          {links.map((link) => (
            <li key={link.url} className="result-card">
              <div className="result-card__main">
                <h3 className="result-card__title">{link.mirror}</h3>
                <p className="result-card__meta">{link.path}</p>
              </div>
              <div className="result-card__mirrors">
                <a
                  className="btn btn--ghost btn--sm"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M14 4h6v6M20 4 10 14" />
                    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
                  </svg>
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {guidance && (
        <section className="guidance">
          <h2 className="guidance__title">{guidance.name}</h2>
          <p className="guidance__summary">{guidance.summary}</p>

          <ol className="guidance__steps">
            {guidance.steps.map((step) => (
              <li key={step.step}>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </li>
            ))}
          </ol>

          {guidance.tips.length > 0 && (
            <>
              <h3 className="guidance__subtitle">Tips</h3>
              <ul className="guidance__tips">
                {guidance.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </>
          )}

          <p className="guidance__note">{guidance.notes}</p>
        </section>
      )}
    </div>
  );
}
