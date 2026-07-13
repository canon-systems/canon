import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const NANGO_TEMPLATE_LOGO_BASE_URL =
  process.env.NANGO_TEMPLATE_LOGO_BASE_URL ||
  process.env.NEXT_PUBLIC_NANGO_TEMPLATE_LOGO_BASE_URL ||
  'https://app.nango.dev/images/template-logos';

const NANGO_LOGO_NAMES: Record<string, string> = {
  slack: 'slack',
  granola: 'granola',
  teams: 'microsoft-teams',
  gmail: 'google-mail',
  google_calendar: 'google-calendar',
  outlook: 'outlook',
};

function svgResponse(body: BodyInit, cacheControl: string) {
  return new NextResponse(body, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': cacheControl,
    },
  });
}

function nangoLogoUrl(name: string) {
  return `${NANGO_TEMPLATE_LOGO_BASE_URL.replace(/\/$/, '')}/${name}.svg`;
}

async function fetchNangoLogo(name: string) {
  const response = await fetch(nangoLogoUrl(name), {
    cache: 'no-store',
    signal: AbortSignal.timeout(1500),
  });

  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('svg')) return null;

  return response.text();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await params;
  const provider = rawProvider.trim().toLowerCase();
  const logoName = NANGO_LOGO_NAMES[provider];
  if (!logoName) return NextResponse.json({ error: 'Unsupported logo provider' }, { status: 404 });

  try {
    const logo = await fetchNangoLogo(logoName);
    if (logo) return svgResponse(logo, 'public, max-age=3600');
  } catch {
    return NextResponse.json({ error: 'Failed to load Nango logo' }, { status: 502 });
  }

  return NextResponse.json({ error: 'Nango logo not found' }, { status: 404 });
}
