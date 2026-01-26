import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listJiraProjectsForUser } from '@/lib/server/jira/projects';

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cloudId = request.nextUrl.searchParams.get('cloudId');
    const result = await listJiraProjectsForUser(user.id, cloudId);

    return NextResponse.json({
      projects: result.projects,
      warning: result.warning,
      cloudId: result.cloudId,
    });
  } catch (err: any) {
    console.error('Failed to list Jira projects:', err);
    return NextResponse.json(
      {
        error: 'Failed to list Jira projects',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
