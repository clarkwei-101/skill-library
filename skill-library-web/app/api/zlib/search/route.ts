import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function base() {
  return (
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8000'
  ).replace(/\/$/, '');
}

/** Proxy the zlib search endpoint (guidance + mirror links). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') || '';
  try {
    const res = await fetch(`${base()}/api/zlib/search?q=${encodeURIComponent(q)}`, {
      cache: 'no-store',
    });
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
      { detail: 'Upstream API unreachable', error: String(err) },
      { status: 502 }
    );
  }
}
