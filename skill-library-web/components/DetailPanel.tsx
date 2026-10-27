'use client';

import { useEffect, useState } from 'react';
import type { Skill } from '@/lib/types';

export interface DetailPanelProps {
  skill: Skill | null;
  onClose: () => void;
}

type DownloadState = 'idle' | 'loading' | 'done' | 'error';

export default function DetailPanel({ skill, onClose }: DetailPanelProps) {
  const [state, setState] = useState<DownloadState>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setState('idle');
    setMessage('');
  }, [skill?.slug]);

  if (!skill) return null;

  /**
   * The API streams an application/zip, so the browser downloads it
   * directly rather than us parsing a JSON body.
   */
  const download = () => {
    setState('loading');
    setMessage('');

    const href = `/api/skills/${encodeURIComponent(skill.slug)}/download`;
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.rel = 'noreferrer noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setState('done');
    setMessage('Your download is starting.');
  };

  const title = skill.name || skill.slug;

  return (
    <aside
      className="detail-panel"
      role="complementary"
      aria-label={`Details for ${title}`}
    >
      <div className="detail-panel__header">
        <div>
          <p className="detail-panel__eyebrow">
            {skill.chapterCount != null
              ? `${skill.chapterCount} chapter${skill.chapterCount === 1 ? '' : 's'}`
              : 'Skill'}
          </p>
          <h2 className="detail-panel__title">{title}</h2>
          <p className="detail-panel__slug">{skill.slug}</p>
        </div>
        <button className="detail-panel__close" onClick={onClose} aria-label="Close details">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="detail-panel__body">
        <p className="detail-panel__description">
          {skill.description || 'No description provided for this skill yet.'}
        </p>

        <dl className="detail-panel__meta">
          {skill.author && (
            <div>
              <dt>Author</dt>
              <dd>{skill.author}</dd>
            </div>
          )}
          {skill.version && (
            <div>
              <dt>Version</dt>
              <dd>{skill.version}</dd>
            </div>
          )}
          {skill.chapterCount != null && (
            <div>
              <dt>Chapters</dt>
              <dd>{skill.chapterCount}</dd>
            </div>
          )}
          {skill.hasZip != null && (
            <div>
              <dt>Package</dt>
              <dd>{skill.hasZip ? 'Stored zip' : 'Generated on demand'}</dd>
            </div>
          )}
        </dl>

        {skill.chapters && skill.chapters.length > 0 && (
          <div className="detail-panel__chapters">
            <h3 className="detail-panel__subtitle">Chapters</h3>
            <ul>
              {skill.chapters.slice(0, 8).map((chapter) => (
                <li key={chapter}>{chapter}</li>
              ))}
            </ul>
            {skill.chapters.length > 8 && (
              <p className="detail-panel__more">+{skill.chapters.length - 8} more</p>
            )}
          </div>
        )}

        {skill.tags && skill.tags.length > 0 && (
          <div className="detail-panel__tags">
            {skill.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="detail-panel__footer">
        <button
          className="btn btn--primary"
          onClick={download}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Preparing…
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Download Skill
            </>
          )}
        </button>

        {message && (
          <p className={`detail-panel__message ${state === 'error' ? 'is-error' : ''}`}>
            {message}
          </p>
        )}
      </div>
    </aside>
  );
}
