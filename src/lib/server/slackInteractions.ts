import type { SupabaseClient } from '@supabase/supabase-js';

export type AccessRequestContext = {
  id: string;
  tool_name: string;
  new_hire_id: string;
  organization_id: string;
};

function joinedHireOrganizationId(row: { new_hires?: unknown }): string | null {
  const hire = Array.isArray(row.new_hires) ? row.new_hires[0] : row.new_hires;
  if (!hire || typeof hire !== 'object') return null;
  const organizationId = (hire as { organization_id?: unknown }).organization_id;
  return typeof organizationId === 'string' ? organizationId : null;
}

export async function getAccessRequestContext(params: {
  supabase: SupabaseClient;
  accessRequestId: string;
  slackTeamId?: string;
}): Promise<AccessRequestContext | null> {
  const { supabase, accessRequestId, slackTeamId } = params;

  const { data: request, error } = await supabase
    .from('access_requests')
    .select('id, tool_name, new_hire_id, new_hires!inner(organization_id)')
    .eq('id', accessRequestId)
    .single();

  if (error || !request) return null;

  const organizationId = joinedHireOrganizationId(request);
  if (!organizationId || typeof request.new_hire_id !== 'string') return null;

  if (slackTeamId) {
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('metadata')
      .eq('organization_id', organizationId)
      .eq('provider', 'slack')
      .eq('status', 'active')
      .maybeSingle();

    const metadata = connection?.metadata && typeof connection.metadata === 'object'
      ? connection.metadata as Record<string, unknown>
      : {};

    if (metadata.team_id !== slackTeamId) return null;
  }

  return {
    id: request.id,
    tool_name: request.tool_name,
    new_hire_id: request.new_hire_id,
    organization_id: organizationId,
  };
}
