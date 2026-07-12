'use client';

import { useCallback, useEffect, useState } from 'react';

import type { OrgTool, RoleProfile } from '@/types/onboarding';
import { useReadinessRoles } from './useReadinessRoles';
import { useReadinessTools } from './useReadinessTools';

type UseReadinessSettingsParams = {
  enabled: boolean;
  setGlobalError: (message: string) => void;
};

export function useReadinessSettings({ enabled, setGlobalError }: UseReadinessSettingsParams) {
  const [tools, setTools] = useState<OrgTool[]>([]);
  const [roleProfiles, setRoleProfiles] = useState<RoleProfile[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);

  const loadTools = useCallback(async () => {
    setToolsLoading(true);
    setRolesLoading(true);
    try {
      const [toolsRes, rolesRes] = await Promise.all([
        fetch('/api/onboarding/org-tools'),
        fetch('/api/onboarding/role-profiles?include_archived=true'),
      ]);
      const data = (await toolsRes.json()) as { tools?: OrgTool[] };
      const rolesData = (await rolesRes.json()) as { profiles?: RoleProfile[] };
      setTools(data.tools ?? []);
      setRoleProfiles(rolesData.profiles ?? []);
    } catch {
      // non-fatal
    } finally {
      setToolsLoading(false);
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void loadTools();
  }, [enabled, loadTools]);

  const roleSettings = useReadinessRoles({ roleProfiles, reload: loadTools });
  const toolSettings = useReadinessTools({
    tools,
    setTools,
    roleProfiles,
    reload: loadTools,
    setGlobalError,
  });

  return {
    tools,
    roleProfiles,
    toolsLoading,
    rolesLoading,
    ...roleSettings,
    ...toolSettings,
  };
}
