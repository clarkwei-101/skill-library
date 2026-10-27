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
 * Forward a multipart upload to the backend converter.
 *
 * The API takes the file as the `file` form field and the title as a
 * `title` query parameter, so both are translated here.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const title = form.get('title');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ detail: 'a "file" field is required' }, { status: 400 });
    }

    const upstream = new FormData();
    upstream.append('file', file, (file as File).name);

    const query = new URLSearchParams();
    if (typeof title === 'string' && title.trim()) {
      query.set('title', title.trim());
    }

    const suffix = query.toString();
    const res = await fetch(`${base()}/api/convert/upload${suffix ? `?${suffix}` : ''}`, {
      method: 'POST',
      body: upstream,
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
      { detail: 'Upload failed', error: String(err) },
      { status: 502 }
    );
  }
}
