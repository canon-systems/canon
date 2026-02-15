import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Knowledge-base resource browsing is archived for now.
 */
export async function GET() {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    {
      success: false,
      resources: [],
      error: 'Knowledge base push is archived for now.',
    },
    { status: 410 }
  );
}
