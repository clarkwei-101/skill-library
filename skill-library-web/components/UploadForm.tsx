'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConvertTask } from '@/lib/types';

const ACCEPT = '.pdf,.epub,.docx,.txt';

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

const TERMINAL_DONE = ['succeeded', 'completed', 'success', 'done', 'finished'];
const TERMINAL_FAIL = ['failed', 'error', 'cancelled', 'canceled'];

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState('');
  const [message, setMessage] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertTask['result']>(null);
  const [dragging, setDragging] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  const reset = () => {
    setPhase('idle');
    setProgress(0);
    setStep('');
    setMessage('');
    setDownloadUrl(null);
    setResult(null);
    setFile(null);
    setTitle('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const startPolling = (taskId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase('processing');
    setProgress(5);
    setStep('Conversion started');

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/convert/${encodeURIComponent(taskId)}`, {
          cache: 'no-store',
        });
        const task = (await res.json().catch(() => ({}))) as ConvertTask;
        const status = String(task?.status || '').toLowerCase();

        // The API reports progress as a 0.0 – 1.0 fraction.
        if (typeof task?.progress === 'number') {
          setProgress(Math.max(5, Math.min(99, task.progress * 100)));
        }
        if (task?.message) setStep(task.message);

        if (TERMINAL_DONE.includes(status)) {
          if (pollRef.current) clearInterval(pollRef.current);
          setProgress(100);
          setPhase('done');
          setResult(task?.result ?? null);
          const url = task?.result?.downloadUrl ?? null;
          setDownloadUrl(url);
          setStep(task?.message || 'Conversion complete');
          setMessage(
            task?.result?.chapterCount != null
              ? `Converted into a skill with ${task.result.chapterCount} chapters.`
              : 'Conversion complete.'
          );
        } else if (TERMINAL_FAIL.includes(status)) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase('error');
          setMessage(task?.error || task?.message || 'Conversion failed.');
        }
      } catch (err) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase('error');
        setMessage(err instanceof Error ? err.message : 'Lost contact with the API.');
      }
    }, 2000);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setPhase('error');
      setMessage('Please choose a file first.');
      return;
    }

    setPhase('uploading');
    setProgress(2);
    setMessage('');
    setDownloadUrl(null);
    setResult(null);

    const form = new FormData();
    form.append('file', file);
    if (title.trim()) form.append('title', title.trim());

    try {
      const res = await fetch('/api/convert/upload', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.detail || body?.error || `HTTP ${res.status}`);
      }
      const taskId = body?.taskId || body?.task_id || body?.id;
      if (!taskId) {
        setPhase('done');
        setProgress(100);
        setDownloadUrl(body?.result?.downloadUrl ?? body?.downloadUrl ?? null);
        setResult(body?.result ?? null);
        setMessage('Conversion complete.');
        return;
      }
      startPolling(String(taskId));
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const busy = phase === 'uploading' || phase === 'processing';
  const href = downloadUrl?.startsWith('http')
    ? downloadUrl
    : downloadUrl
      ? `/api/skills/${encodeURIComponent(downloadUrl.replace('/api/skills/', '').replace('/download', ''))}/download`
      : null;

  return (
    <form className="upload-form" onSubmit={submit}>
      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) {
            setFile(dropped);
            if (!title) setTitle(dropped.name.replace(/\.[^.]+$/, ''));
          }
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4m0 0L8 8m4-4 4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <p className="dropzone__title">
          {file ? file.name : 'Drop a file here or click to browse'}
        </p>
        <p className="dropzone__hint">Supported formats: PDF, EPUB, DOCX, TXT</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            setFile(picked);
            if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, ''));
          }}
        />
      </div>

      <label className="field">
        <span className="field__label">Book title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 深入理解计算机系统"
          disabled={busy}
        />
      </label>

      <div className="upload-form__actions">
        <button type="submit" className="btn btn--primary" disabled={busy || !file}>
          {phase === 'uploading' ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Uploading…
            </>
          ) : phase === 'processing' ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Converting…
            </>
          ) : (
            'Convert to Skill'
          )}
        </button>
        {(phase === 'done' || phase === 'error') && (
          <button type="button" className="btn btn--ghost" onClick={reset}>
            Start over
          </button>
        )}
      </div>

      {(busy || phase === 'done') && (
        <div className="progress" aria-live="polite">
          <div className="progress__track">
            <div className="progress__bar" style={{ width: `${Math.max(3, progress)}%` }} />
          </div>
          <p className="progress__label">
            {step || (phase === 'uploading' ? 'Uploading file' : 'Working')} · {Math.round(progress)}%
          </p>
        </div>
      )}

      {result && phase === 'done' && (
        <div className="convert-result">
          {result.title && (
            <p className="convert-result__title">{result.title}</p>
          )}
          <dl className="convert-result__stats">
            {result.chapterCount != null && (
              <div>
                <dt>Chapters</dt>
                <dd>{result.chapterCount}</dd>
              </div>
            )}
            {result.characters != null && (
              <div>
                <dt>Characters</dt>
                <dd>{result.characters.toLocaleString()}</dd>
              </div>
            )}
            {result.slug && (
              <div>
                <dt>Slug</dt>
                <dd>{result.slug}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {message && (
        <p className={`upload-form__message ${phase === 'error' ? 'is-error' : ''}`}>
          {message}
        </p>
      )}

      {phase === 'done' && href && (
        <a
          className="btn btn--ghost download-link"
          href={href}
          target="_blank"
          rel="noreferrer noopener"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Download converted skill
        </a>
      )}
    </form>
  );
}
