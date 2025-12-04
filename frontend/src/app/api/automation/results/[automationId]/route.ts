import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

/**
 * GET /api/automation/results/[automationId] - Get automation result details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ automationId: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { automationId } = await params;
    const supabase = await createClient();

    const { data: result, error } = await supabase
      .from('automation_results')
      .select('*')
      .eq('id', automationId)
      .eq('user_id', user.id)
      .single();

    if (error || !result) {
      return NextResponse.json(
        { error: 'Automation result not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to fetch automation result:', error);
    return NextResponse.json(
      { error: 'Failed to fetch automation result' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/automation/results/[automationId]/approve - Approve automation results
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ automationId: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { automationId } = await params;
    const body = await request.json();
    const { approvedItems, publishTargets } = body;

    const supabase = await createClient();

    // Get the automation result
    const { data: result, error: fetchError } = await supabase
      .from('automation_results')
      .select('*')
      .eq('id', automationId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !result) {
      return NextResponse.json(
        { error: 'Automation result not found' },
        { status: 404 }
      );
    }

    // TODO: Implement publishing logic based on approvedItems and publishTargets
    // For now, just mark the result as processed
    await supabase
      .from('automation_results')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString()
      })
      .eq('id', automationId);

    return NextResponse.json({
      success: true,
      message: 'Automation results approved and published'
    });
  } catch (error: any) {
    console.error('Failed to approve automation results:', error);
    return NextResponse.json(
      { error: 'Failed to approve automation results' },
      { status: 500 }
    );
  }
}
