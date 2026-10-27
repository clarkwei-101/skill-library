'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import BookshelfScene from '@/components/BookshelfScene';
import DetailPanel from '@/components/DetailPanel';
import type { Skill } from '@/lib/types';

type Mode = 'loading' | '3d' | '2d' | 'error';

export default function HomePage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mode, setMode] = useState<Mode>('loading');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Skill | null>(null);
  const [hovered, setHovered] = useState<Skill | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  // Load the catalogue from the backend proxy.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/skills', { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.detail || body?.error || `HTTP ${res.status}`);
        const list: Skill[] = Array.isArray(body)
          ? body
          : body?.skills ?? body?.items ?? body?.data ?? [];
        if (cancelled) return;
        setSkills(list);
        setMode('3d');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load skills');
        setMode('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleWebGLFail = useCallback(() => {
    setMode('2d');
  }, []);

  // Track the pointer for the tooltip.
  const onPointerMove = (e: React.MouseEvent) => {
    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onSelect = (skill: Skill) => {
    setSelected(skill);
  };

  if (mode === '2d') {
    return (
      <div className="grid-page">
        <div className="grid-page__head">
          <h1>Skill Library</h1>
          <p>
            3D rendering is unavailable on this device, so here is the flat view — {skills.length}{' '}
            skill{skills.length === 1 ? '' : 's'} available.
          </p>
        </div>
        <ul className="skill-grid">
          {skills.map((skill) => (
            <li key={skill.slug}>
              <button className="skill-tile" onClick={() => setSelected(skill)}>
                <span className="skill-tile__spine" />
                <h3>{skill.name || skill.slug}</h3>
                <p>{skill.description || 'No description provided.'}</p>
                <span className="skill-tile__slug">{skill.slug}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <DetailPanel skill={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    );
  }

  if (mode === 'error') {
    return (
      <div className="grid-page">
        <div className="grid-page__head">
          <h1>Skill Library</h1>
        </div>
        <p className="hero__error" style={{ position: 'static', transform: 'none' }}>
          Could not reach the API: {error}. Is the backend running on{' '}
          {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}?
        </p>
      </div>
    );
  }

  return (
    <div className="hero" ref={heroRef} onMouseMove={onPointerMove}>
      <div className="hero__canvas">
        {mode === '3d' && (
          <BookshelfScene
            skills={skills}
            selectedSlug={selected?.slug ?? null}
            onHover={setHovered}
            onSelect={onSelect}
            onWebGLFail={handleWebGLFail}
          />
        )}
      </div>
      <div className="hero__vignette" />

      {mode === 'loading' && <div className="hero__loading">Loading the shelf…</div>}

      <div className="hero__intro">
        <h1 className="hero__title">Your skills, on a shelf.</h1>
        <p className="hero__subtitle">
          Every skill in the library is a book you can pull off the shelf. Hover to pull one out,
          click to open it.
        </p>
        <span className="hero__count">
          <b>{skills.length}</b> skill{skills.length === 1 ? '' : 's'} on the shelf
        </span>
      </div>

      <div className="hero__hints">
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m9 11 3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          hover to preview
        </span>
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 3v6l-5 8a2 2 0 0 0 1.8 3h12.4a2 2 0 0 0 1.8-3l-5-8V3" />
          </svg>
          click to open
        </span>
      </div>

      {hovered && !selected && (
        <div className="tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <p className="tooltip__title">{hovered.name || hovered.slug}</p>
          <p className="tooltip__meta">
            {[
              hovered.author,
              hovered.version,
              hovered.chapterCount != null
                ? `${hovered.chapterCount} chapters`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || hovered.slug}
          </p>
        </div>
      )}

      {selected && <DetailPanel skill={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
