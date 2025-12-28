import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

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
    const supabase = await createSupabaseClient();

    // Fetch from new automation_rules table
    const { data: rules, error } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('repo_id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Automation GET error:', error);
      throw error;
    }

    // Convert to the expected response format
    const automationRules = (rules || []).map(rule => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      schedule: rule.schedule,
      generate_doc: rule.generate_doc,
      generate_diagram: rule.generate_diagram,
      auto_publish: rule.auto_publish,
      target_diagrams: rule.target_diagrams,
      // Legacy fields
      auto_publish_target: rule.auto_publish_target,
    }));

    // For now, return empty metadata (this will be migrated separately)
    const automationMetadata = {};

    return NextResponse.json(
      {
        automation_rules: automationRules,
        automation_metadata: automationMetadata,
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

    const supabase = await createSupabaseClient();

    if (body.automation_rules.length === 0) {
      await supabase
        .from('automation_rules')
        .delete()
        .eq('repo_id', id)
        .eq('user_id', user.id);

      return NextResponse.json(
        {
          automation_rules: [],
          automation_metadata: {},
          scheduling_results: [],
        },
        { status: 200 }
      );
    }

    const incomingRule = body.automation_rules[0] || {};
    const actionPreset = typeof (incomingRule as any)?.action_preset === 'string' ? String((incomingRule as any).action_preset) : null;
    const generateDoc =
      typeof incomingRule.generate_doc === 'boolean'
        ? incomingRule.generate_doc
        : actionPreset
          ? actionPreset !== 'diagrams_only'
          : true;
    const generateDiagram =
      typeof incomingRule.generate_diagram === 'boolean'
        ? incomingRule.generate_diagram
        : actionPreset
          ? actionPreset === 'diagrams_only' || actionPreset === 'docs_and_diagrams' || actionPreset === 'full_auto_publish'
          : false;
    const autoPublish =
      typeof incomingRule.auto_publish === 'boolean'
        ? incomingRule.auto_publish
        : actionPreset
          ? actionPreset === 'full_auto_publish'
          : false;

    const { data: existingRule, error: existingError } = await supabase
      .from('automation_rules')
      .select('id')
      .eq('repo_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError) {
      console.error('Automation PATCH fetch existing rule error:', existingError);
      throw existingError;
    }

    const writePayload = {
      user_id: user.id,
      repo_id: id,
      name: incomingRule.name,
      enabled: incomingRule.enabled ?? true,
      schedule: incomingRule.schedule,
      generate_doc: generateDoc,
      generate_diagram: generateDiagram,
      auto_publish: autoPublish,
      target_diagrams: Array.isArray(incomingRule.target_diagrams) ? incomingRule.target_diagrams : [],
      auto_publish_target: incomingRule.auto_publish_target ?? null,
    };

    const { data: savedRule, error: saveError } = existingRule?.id
      ? await supabase
          .from('automation_rules')
          .update(writePayload)
          .eq('id', existingRule.id)
          .select()
          .single()
      : await supabase
          .from('automation_rules')
          .insert(writePayload)
          .select()
          .single();

    if (saveError) {
      console.error('Automation PATCH save error:', saveError);
      throw saveError;
    }

    // Note: Schedules are handled by the checkAndRunAutomations function
    // which runs every 5 minutes and checks all enabled rules

    return NextResponse.json(
      {
        automation_rules: [
          {
            id: savedRule.id,
            name: savedRule.name,
            enabled: savedRule.enabled,
            schedule: savedRule.schedule,
            generate_doc: savedRule.generate_doc,
            generate_diagram: savedRule.generate_diagram,
            auto_publish: savedRule.auto_publish,
            target_diagrams: savedRule.target_diagrams,
            auto_publish_target: savedRule.auto_publish_target,
          },
        ],
        automation_metadata: {}, // Will be migrated separately
        scheduling_results: [], // TODO: Implement GitHub Actions scheduling
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
