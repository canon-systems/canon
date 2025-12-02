import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

interface RepoRow {
  settings: Record<string, any> | null;
}

async function fetchRepoSettings(repoId: string, userId: string) {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from('workspace_repos')
    .select('settings')
    .eq('id', repoId)
    .eq('workspace_id', userId)
    .single();

  return { data: data as RepoRow | null, error };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { data, error } = await fetchRepoSettings(id, user.id);

    if (error && error.code !== 'PGRST116') {
      console.error('Automation GET supabase error:', error);
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { automation_rules: [], automation_metadata: {} },
        { status: 200 }
      );
    }

    const settings = data.settings || {};
    const rules = Array.isArray(settings.automation_rules) ? settings.automation_rules : [];
    const metadata = settings.automation_metadata || {};

    return NextResponse.json(
      {
        automation_rules: rules,
        automation_metadata: metadata,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Automation GET error:', err);
    return NextResponse.json(
      {
        error: 'Failed to load automation rules',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({})) as {
      automation_rules?: Array<Record<string, any>>;
    };

    if (!Array.isArray(body.automation_rules)) {
      return NextResponse.json(
        { error: 'automation_rules must be an array' },
        { status: 400 }
      );
    }

    const { data, error } = await fetchRepoSettings(id, user.id);

    if (error && error.code !== 'PGRST116') {
      console.error('Automation PATCH supabase error:', error);
      throw error;
    }

    if (!data) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    const supabase = await createSupabaseClient();
    const currentSettings = data.settings || {};
    const metadata = currentSettings.automation_metadata || {};
    const sanitizedRules = body.automation_rules.map((rule) => ({ ...rule }));

    const updatedSettings = {
      ...currentSettings,
      automation_rules: sanitizedRules,
      automation_metadata: metadata,
    };

    const { error: updateError } = await supabase
      .from('workspace_repos')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', user.id);

    if (updateError) {
      console.error('Automation PATCH update error:', updateError);
      throw updateError;
    }

    return NextResponse.json(
      {
        automation_rules: sanitizedRules,
        automation_metadata: metadata,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Automation PATCH error:', err);
    return NextResponse.json(
      {
        error: 'Failed to save automation rules',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

