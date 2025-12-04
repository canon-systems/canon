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
      .eq('repo_id', id);

    if (error) {
      console.error('Automation GET error:', error);
      throw error;
    }

    // Convert to the expected response format
    const automationRules = (rules || []).map(rule => ({
      id: rule.rule_id,
      name: rule.name,
      enabled: rule.enabled,
      schedule: rule.schedule,
      action_preset: rule.action_preset,
      significance_analysis: rule.significance_analysis,
      target_documents: rule.target_documents,
      target_diagrams: rule.target_diagrams,
      notifications: rule.notifications,
      publish_targets: rule.publish_targets,
      // Legacy fields
      generate_doc: rule.generate_doc,
      generate_diagram: rule.generate_diagram,
      auto_publish: rule.auto_publish,
      auto_publish_new_docs: rule.auto_publish_new_docs,
      auto_publish_max_changes: rule.auto_publish_max_changes,
      auto_publish_max_change_percentage: rule.auto_publish_max_change_percentage,
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

    // Delete existing rules for this repo
    await supabase
      .from('automation_rules')
      .delete()
      .eq('repo_id', id);

    // Insert new rules
    const rulesToInsert = body.automation_rules.map(rule => ({
      workspace_id: user.id,
      repo_id: id,
      rule_id: rule.id || rule.name || 'default',
      name: rule.name,
      enabled: rule.enabled ?? true,
      schedule: rule.schedule,
      action_preset: rule.action_preset,
      significance_analysis: rule.significance_analysis,
      target_documents: rule.target_documents || [],
      target_diagrams: rule.target_diagrams || [],
      notifications: rule.notifications,
      publish_targets: rule.publish_targets,
      // Legacy fields
      generate_doc: rule.generate_doc,
      generate_diagram: rule.generate_diagram,
      auto_publish: rule.auto_publish,
      auto_publish_new_docs: rule.auto_publish_new_docs,
      auto_publish_max_changes: rule.auto_publish_max_changes,
      auto_publish_max_change_percentage: rule.auto_publish_max_change_percentage,
      auto_publish_target: rule.auto_publish_target,
    }));

    const { error: insertError } = await supabase
      .from('automation_rules')
      .insert(rulesToInsert);

    if (insertError) {
      console.error('Automation PATCH insert error:', insertError);
      throw insertError;
    }

    return NextResponse.json(
      {
        automation_rules: body.automation_rules,
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

