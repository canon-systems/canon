import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Scheduling is now fully managed by Canon (weekly, automatic).
 * User-defined schedule CRUD is intentionally disabled.
 */
export async function PATCH() {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: 'Scheduling is managed automatically. Manual schedule configuration is disabled.',
    },
    { status: 410 }
  );
}

export async function DELETE() {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: 'Scheduling is managed automatically. Manual schedule configuration is disabled.',
    },
    { status: 410 }
  );
}
