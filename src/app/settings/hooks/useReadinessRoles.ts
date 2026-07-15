'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DEFAULT_BASELINE_RAMP_DAYS, DEFAULT_TARGET_RAMP_DAYS } from '@/lib/onboarding/milestone-ramp';
import { activeRoleProfiles, normalizeRoleName } from '@/lib/onboarding/roles';
import type { RoleProfile } from '@/types/onboarding';

type UseReadinessRolesParams = {
  roleProfiles: RoleProfile[];
  reload: () => Promise<void>;
};

export function useReadinessRoles({ roleProfiles, reload }: UseReadinessRolesParams) {
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [addRoleSaving, setAddRoleSaving] = useState(false);
  const [newRole, setNewRole] = useState({
    role: '',
    job_description: '',
    baseline_ramp_days: String(DEFAULT_BASELINE_RAMP_DAYS),
    target_ramp_days: String(DEFAULT_TARGET_RAMP_DAYS),
  });
  const [editingRole, setEditingRole] = useState<RoleProfile | null>(null);
  const [editRoleForm, setEditRoleForm] = useState({ job_description: '', baseline_ramp_days: '90', target_ramp_days: '45' });
  const [editRoleSaving, setEditRoleSaving] = useState(false);
  const [archivingRole, setArchivingRole] = useState<RoleProfile | null>(null);
  const [archiveRoleSaving, setArchiveRoleSaving] = useState(false);
  const [restoreRoleId, setRestoreRoleId] = useState<string | null>(null);

  const activeRoles = useMemo(() => activeRoleProfiles(roleProfiles), [roleProfiles]);
  const archivedRoles = useMemo(
    () => roleProfiles
      .filter((profile) => profile.status === 'archived')
      .sort((a, b) => (a.display_order - b.display_order) || a.role.localeCompare(b.role)),
    [roleProfiles]
  );

  async function addRole() {
    const role = normalizeRoleName(newRole.role);
    if (!role) return;
    setAddRoleSaving(true);
    try {
      const res = await fetch('/api/onboarding/role-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role,
          job_description: newRole.job_description,
          baseline_ramp_days: Number(newRole.baseline_ramp_days),
          target_ramp_days: Number(newRole.target_ramp_days),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'add_role');
      setNewRole({
        role: '',
        job_description: '',
        baseline_ramp_days: String(DEFAULT_BASELINE_RAMP_DAYS),
        target_ramp_days: String(DEFAULT_TARGET_RAMP_DAYS),
      });
      setAddRoleOpen(false);
      await reload();
      toast.success('Role added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong adding the role.');
    } finally {
      setAddRoleSaving(false);
    }
  }

  function openEditRole(profile: RoleProfile) {
    setEditingRole(profile);
    setEditRoleForm({
      job_description: profile.job_description ?? '',
      baseline_ramp_days: String(profile.baseline_ramp_days ?? DEFAULT_BASELINE_RAMP_DAYS),
      target_ramp_days: String(profile.target_ramp_days ?? DEFAULT_TARGET_RAMP_DAYS),
    });
  }

  async function saveRole() {
    if (!editingRole) return;
    setEditRoleSaving(true);
    try {
      const res = await fetch('/api/onboarding/role-profiles', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role: editingRole.role,
          job_description: editRoleForm.job_description,
          baseline_ramp_days: Number(editRoleForm.baseline_ramp_days),
          target_ramp_days: Number(editRoleForm.target_ramp_days),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'save_role');
      setEditingRole(null);
      await reload();
      toast.success('Role saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong saving the role.');
    } finally {
      setEditRoleSaving(false);
    }
  }

  async function archiveRole() {
    if (!archivingRole) return;
    setArchiveRoleSaving(true);
    try {
      const res = await fetch(`/api/onboarding/role-profiles?${new URLSearchParams({ role: archivingRole.role }).toString()}`, {
        method: 'DELETE',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'archive_role');
      setArchivingRole(null);
      await reload();
      toast.success('Role archived');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong archiving the role.');
    } finally {
      setArchiveRoleSaving(false);
    }
  }

  async function restoreRole(profile: RoleProfile) {
    setRestoreRoleId(profile.id);
    try {
      const res = await fetch('/api/onboarding/role-profiles', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role: profile.role,
          job_description: profile.job_description ?? '',
          baseline_ramp_days: profile.baseline_ramp_days ?? DEFAULT_BASELINE_RAMP_DAYS,
          target_ramp_days: profile.target_ramp_days ?? DEFAULT_TARGET_RAMP_DAYS,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'restore_role');
      await reload();
      toast.success('Role restored');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong restoring the role.');
    } finally {
      setRestoreRoleId(null);
    }
  }

  return {
    activeRoles,
    archivedRoles,
    addRoleOpen,
    setAddRoleOpen,
    addRoleSaving,
    newRole,
    setNewRole,
    editingRole,
    setEditingRole,
    editRoleForm,
    setEditRoleForm,
    editRoleSaving,
    archivingRole,
    setArchivingRole,
    archiveRoleSaving,
    restoreRoleId,
    addRole,
    openEditRole,
    saveRole,
    archiveRole,
    restoreRole,
  };
}
