import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { listUserDiagrams } from '@/lib/server/architecture/persistence';

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const diagrams = await listUserDiagrams(supabase, user.id);

    return NextResponse.json({ diagrams });
  } catch (err: any) {
    console.error('Error listing diagrams:', err);
    return NextResponse.json(
      {
        error: 'Failed to list diagrams',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

