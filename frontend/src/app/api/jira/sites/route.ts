import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listJiraSitesForUser } from '@/lib/server/jira/sites';

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sites = await listJiraSitesForUser(user.id);

    return NextResponse.json({ sites });
  } catch (err: any) {
    console.error('Failed to list Jira sites:', err);
    return NextResponse.json(
      {
        error: 'Failed to list Jira sites',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
