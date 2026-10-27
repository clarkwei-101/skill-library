import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Proxy the backend skills catalogue. */
export async function GET() {
  const base = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/skills`, { cache: 'no-store' });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'Upstream API unreachable', detail: String(err) },
      { status: 502 }
    );
  }
}
