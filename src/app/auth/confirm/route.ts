import { type EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { safeRedirectPath } from '@/lib/authRedirect';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function continueUrl(request: NextRequest, next: string) {
  const url = new URL('/auth/continue', request.nextUrl.origin);
  url.searchParams.set('next', next);
  return url;
}

function loginErrorUrl(request: NextRequest, next: string) {
  const url = new URL('/login', request.nextUrl.origin);
  url.searchParams.set('next', next);
  url.searchParams.set('error', 'auth_callback');
  return url;
}

export async function GET(request: NextRequest) {
  const next = safeRedirectPath(request.nextUrl.searchParams.get('next'));
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(error ? loginErrorUrl(request, next) : continueUrl(request, next));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    return NextResponse.redirect(error ? loginErrorUrl(request, next) : continueUrl(request, next));
  }

  return NextResponse.redirect(loginErrorUrl(request, next));
}
