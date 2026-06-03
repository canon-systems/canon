import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      first_name?: unknown;
      last_name?: unknown;
    };
    const firstName = stringField(body.first_name);
    const lastName = stringField(body.last_name);
    const existingFirstName = stringField(user.user_metadata?.first_name);
    const existingLastName = stringField(user.user_metadata?.last_name);
    if (existingFirstName || existingLastName) {
      if (existingFirstName === firstName && existingLastName === lastName) {
        return NextResponse.json({
          profile: {
            first_name: existingFirstName,
            last_name: existingLastName,
            full_name: `${existingFirstName} ${existingLastName}`,
          },
        });
      }

      return NextResponse.json({ error: 'Profile name is already finalized' }, { status: 409 });
    }

    if (firstName.length < 1 || firstName.length > 80) {
      return NextResponse.json({ error: 'First name must be 1-80 characters' }, { status: 400 });
    }
    if (lastName.length < 1 || lastName.length > 80) {
      return NextResponse.json({ error: 'Last name must be 1-80 characters' }, { status: 400 });
    }

    const fullName = `${firstName} ${lastName}`;
    const service = createServiceRoleClient();
    const { data, error } = await service.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        name: fullName,
      },
    });

    if (error || !data.user) throw error ?? new Error('Profile creation failed');

    return NextResponse.json({
      profile: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/profile] POST failed', error);
    return NextResponse.json({ error: 'Failed to create profile', detail }, { status: 500 });
  }
}
