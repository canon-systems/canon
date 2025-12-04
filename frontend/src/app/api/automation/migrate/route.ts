import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/automation/migrate
 * Migrate existing JSON execution history to the new automation_runs table
 */
export async function POST() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow service role or admin users to run migration
    // You might want to add additional checks here

    const supabase = await createClient();

    // Call the migration function
    const { data, error } = await supabase.rpc('migrate_automation_runs');

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      migrated_count: data,
      message: `Successfully migrated ${data} automation runs from JSON to dedicated table`,
    });
  } catch (err: any) {
    console.error('Migration error:', err);
    return NextResponse.json(
      {
        error: 'Failed to migrate automation runs',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
