import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function base() {
  return (
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8000'
  ).replace(/\/$/, '');
}

/**
 * Stream the skill package from the backend.
 *
 * The API returns an application/zip binary, so the response is piped
 * through untouched rather than being parsed as JSON.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  try {
    const upstream = await fetch(
      `${base()}/api/skills/${encodeURIComponent(params.slug)}/download`,
      { cache: 'no-store' }
    );

    if (!upstream.ok) {
      const text = await upstream.text();
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { detail?: string };
        detail = parsed.detail || text;
      } catch {
        /* keep the raw text */
      }
      return NextResponse.json({ detail }, { status: upstream.status });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) headers.set('content-disposition', disposition);
    const length = upstream.headers.get('content-length');
    if (length) headers.set('content-length', length);

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json(
      { detail: 'Upstream API unreachable', error: String(err) },
      { status: 502 }
    );
  }
}
