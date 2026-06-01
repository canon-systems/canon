import { NextRequest, NextResponse } from 'next/server';

import { safeRedirectPath } from '@/lib/authRedirect';
import { getSession } from '@/lib/auth';
import { getOrganizationForUser } from '@/lib/server/organization';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function canContinueWithoutWorkspace(path: string) {
  return (
    path === '/login/update-password' ||
    path.startsWith('/login/update-password?') ||
    path === '/invite/accept' ||
    path.startsWith('/invite/accept?')
  );
}

export async function GET(request: NextRequest) {
  const requestedNext = safeRedirectPath(request.nextUrl.searchParams.get('next'));
  const loginUrl = new URL('/login', request.nextUrl.origin);
  loginUrl.searchParams.set('next', requestedNext);

  const { user, session } = await getSession();
  if (!user || !session) {
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const organization = await getOrganizationForUser(supabase, user);

  let destination = requestedNext;
  if (organization && requestedNext === '/onboarding/workspace') {
    destination = '/';
  }
  if (!organization && !canContinueWithoutWorkspace(requestedNext)) {
    destination = '/onboarding/workspace';
  }

  return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
}
