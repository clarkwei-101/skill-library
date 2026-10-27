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
 * Cookie / session status.
 *
 * The backend never echoes the cookie back — it only reports whether one is
 * configured — so this reads the search endpoint with an empty query and
 * surfaces the `cookieConfigured` flag.
 */
export async function GET() {
  try {
    const res = await fetch(`${base()}/api/zlib/search?q=`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    const configured = Boolean(body?.cookieConfigured);
    return NextResponse.json({
      has_cookies: configured,
      logged_in: configured,
      cookies_count: configured ? 1 : 0,
      message: body?.cookieNote || (configured ? 'ZLIB cookie configured' : 'Anonymous mode'),
    });
  } catch (err) {
    return NextResponse.json(
      { has_cookies: false, logged_in: false, message: 'API unreachable' },
      { status: 502 }
    );
  }
}
