import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Direct Confluence push is archived for now.
 */
export async function POST() {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: 'Knowledge base push is archived for now.',
    },
    { status: 410 }
  );
}
