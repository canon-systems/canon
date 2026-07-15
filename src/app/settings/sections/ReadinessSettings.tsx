import {
  Check as IconCheck,
  Loader2 as IconLoader2,
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash2 as IconTrash,
  Wrench as IconTool,
} from 'lucide-react';

import { SlackUserPicker } from '@/components/SlackUserPicker';
import { ToolLogo } from '@/components/ToolLogo';
import { ToolNameCombobox } from '@/components/tool-name-combobox';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { normalizeRoleName, roleAbbreviation, roleIconColor } from '@/lib/onboarding/roles';
import type { useReadinessSettings } from '../hooks/useReadinessSettings';
import { RoleMultiSelect, selectedRolesLabel } from './RoleMultiSelect';

type ReadinessSettingsState = ReturnType<typeof useReadinessSettings>;

type ReadinessSettingsProps = {
  readinessSettings: ReadinessSettingsState;
};

const dialogContentClass = 'border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]';
const fieldLabelClass = 'block type-body font-medium mb-[5px] text-[var(--text-secondary)]';
const fieldHintClass = 'type-caption mt-1 text-[var(--text-tertiary)]';
const requiredMarkClass = 'text-[var(--red-text)]';
const textareaFieldClass = 'textarea-ui w-full border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body';
const dialogNoticeClass = 'rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-2 type-body text-[var(--text-secondary)]';

export function ReadinessSettings({ readinessSettings }: ReadinessSettingsProps) {
  const {
    toolGroups,
    activeRoles,
    archivedRoles,
    toolsLoading,
    rolesLoading,
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
    addToolOpen,
    setAddToolOpen,
    addToolSaving,
    addToolRole,
    newTool,
    setNewTool,
    editingTool,
    setEditingTool,
    editTool,
    setEditTool,
    editToolSaving,
    deletingTool,
    setDeletingTool,
    deleteToolSaving,
    activeToolRoles,
    editUnavailableToolNames,
    newToolAlreadyConfigured,
    editToolNameConflict,
    addTool,
    confirmDeleteTool,
    addRole,
    openEditRole,
    saveRole,
    archiveRole,
    restoreRole,
    openEditTool,
    openAddTool,
    closeAddTool,
    updateTool,
  } = readinessSettings;

  return (
    <>
      <div className="max-w-5xl">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="type-section-title" style={{ color: 'var(--text-primary)' }}>
              Role Catalog
            </div>
            <p className="type-body mt-[3px]" style={{ color: 'var(--text-secondary)' }}>
              Choose the roles Canon should support, then map the tools and owners each role needs.
            </p>
          </div>
          <Button onClick={() => setAddRoleOpen(true)} className="flex-shrink-0">
            <IconPlus size={13} />
            Add Role
          </Button>
        </div>

        {rolesLoading || toolsLoading ? (
          <div className="flex items-center gap-2 type-body" style={{ color: 'var(--text-tertiary)' }}>
            <IconLoader2 size={14} className="animate-spin" /> Loading Roles...
          </div>
        ) : activeRoles.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Active Roles</div>
            <div className="type-body mt-2" style={{ color: 'var(--text-tertiary)' }}>
              Add a role before Canon can create learning steps and team updates.
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeRoles.map((profile, index) => {
              const roleTools = toolGroups.filter((tool) => tool.allRoles || tool.roles.includes(profile.role));
              const visibleRoleTools = roleTools.slice(0, 8);
              const hiddenToolCount = Math.max(0, roleTools.length - visibleRoleTools.length);

              return (
                <Card key={profile.id} className="px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div
                        className="mt-[1px] flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[8px] type-caption font-medium"
                        style={{ backgroundColor: roleIconColor(profile.role, index), color: 'var(--text-on-accent)' }}
                      >
                        {roleAbbreviation(profile.role)}
                      </div>
                      <div className="min-w-0">
                        <div className="type-card-title text-[var(--text-primary)]">{profile.role}</div>
                        <div className="type-caption mt-[2px] text-[var(--text-tertiary)]">
                          {roleTools.length} tool{roleTools.length === 1 ? '' : 's'} configured · {profile.baseline_ramp_days ?? 90} to {profile.target_ramp_days ?? 45} days
                        </div>
                        <p className="type-body mt-2 line-clamp-2 text-[var(--text-secondary)]">
                          {profile.job_description || 'No job description saved yet.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-start gap-2 lg:items-end">
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button size="sm" variant="secondary" onClick={() => openAddTool(profile.role)}>
                          <IconTool size={13} /> Add Tool
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openEditRole(profile)}>
                          <IconPencil size={13} /> Edit
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setArchivingRole(profile)}>
                          <IconTrash size={13} /> Archive
                        </Button>
                      </div>
                      <div className="flex min-h-8 flex-wrap items-center gap-1.5 lg:justify-end" aria-label={`${profile.role} tools`}>
                        {visibleRoleTools.length === 0 ? (
                          <span className="type-caption text-[var(--text-tertiary)]">No tools yet</span>
                        ) : (
                          <>
                            {visibleRoleTools.map((tool) => (
                              <button
                                key={tool.key}
                                type="button"
                                onClick={() => openEditTool(tool)}
                                className="rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[var(--canon-purple)]/25"
                                title={tool.tool_name}
                                aria-label={`Edit ${tool.tool_name}`}
                              >
                                <ToolLogo toolName={tool.tool_name} size={15} containerSize={30} borderRadius={8} />
                              </button>
                            ))}
                            {hiddenToolCount > 0 && (
                              <span className="flex h-[30px] min-w-[30px] items-center justify-center rounded-[8px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-2 type-caption text-[var(--text-tertiary)]">
                                +{hiddenToolCount}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}

            {archivedRoles.length > 0 && (
              <div className="pt-4">
                <div className="type-kicker mb-2 text-[var(--text-tertiary)]">Archived Roles</div>
                <div className="space-y-2">
                  {archivedRoles.map((profile) => (
                    <Card key={profile.id} className="flex items-center justify-between gap-3 px-4 py-3 opacity-80">
                      <div className="min-w-0">
                        <div className="type-card-title truncate text-[var(--text-primary)]">{profile.role}</div>
                        <div className="type-caption text-[var(--text-tertiary)]">Canon will not create new plans or updates for this role</div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => void restoreRole(profile)} disabled={restoreRoleId === profile.id}>
                        {restoreRoleId === profile.id ? <IconLoader2 size={13} className="animate-spin" /> : <IconCheck size={13} />}
                        Restore
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
        <DialogContent className={`max-w-2xl ${dialogContentClass}`}>
          <DialogHeader>
            <DialogTitle>Add Role</DialogTitle>
            <DialogDescription>Add a role Canon should support with hire plans, tools, and team updates.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className={fieldLabelClass}>
                Role Name <span className={requiredMarkClass}>*</span>
              </label>
              <Input
                value={newRole.role}
                onChange={(e) => setNewRole((p) => ({ ...p, role: e.target.value }))}
                placeholder="Customer Success Engineer"
                maxLength={120}
              />
            </div>
            <div>
              <label className={fieldLabelClass}>
                Job Description
              </label>
              <Textarea
                value={newRole.job_description}
                onChange={(e) => setNewRole((p) => ({ ...p, job_description: e.target.value }))}
                placeholder="Paste responsibilities, tools, customer interactions, and success criteria."
                maxLength={12000}
                className={`${textareaFieldClass} min-h-[220px]`}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={fieldLabelClass}>Current Ramp Days</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={newRole.baseline_ramp_days}
                  onChange={(e) => setNewRole((p) => ({ ...p, baseline_ramp_days: e.target.value }))}
                />
              </div>
              <div>
                <label className={fieldLabelClass}>Target Ramp Days</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={newRole.target_ramp_days}
                  onChange={(e) => setNewRole((p) => ({ ...p, target_ramp_days: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddRoleOpen(false)} disabled={addRoleSaving}>Cancel</Button>
            <Button onClick={() => void addRole()} disabled={addRoleSaving || !normalizeRoleName(newRole.role)}>
              {addRoleSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconPlus size={13} />}
              Add Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingRole !== null} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className={`max-w-2xl ${dialogContentClass}`}>
          <DialogHeader>
            <DialogTitle>{editingRole?.role ?? 'Edit Role'}</DialogTitle>
            <DialogDescription>Update what Canon should know about this role.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className={fieldLabelClass}>
                Job Description
              </label>
              <Textarea
                value={editRoleForm.job_description}
                onChange={(e) => setEditRoleForm((p) => ({ ...p, job_description: e.target.value }))}
                placeholder="Paste responsibilities, tools, customer interactions, and success criteria."
                maxLength={12000}
                className={`${textareaFieldClass} min-h-[240px]`}
              />
              <p className={fieldHintClass}>{editRoleForm.job_description.length}/12000</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={fieldLabelClass}>Current Ramp Days</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={editRoleForm.baseline_ramp_days}
                  onChange={(e) => setEditRoleForm((p) => ({ ...p, baseline_ramp_days: e.target.value }))}
                />
              </div>
              <div>
                <label className={fieldLabelClass}>Target Ramp Days</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={editRoleForm.target_ramp_days}
                  onChange={(e) => setEditRoleForm((p) => ({ ...p, target_ramp_days: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditingRole(null)} disabled={editRoleSaving}>Cancel</Button>
            <Button onClick={() => void saveRole()} disabled={editRoleSaving}>
              {editRoleSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconPencil size={13} />}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archivingRole !== null} onOpenChange={(open) => !open && setArchivingRole(null)}>
        <DialogContent className={`max-w-md ${dialogContentClass}`}>
          <DialogHeader>
            <DialogTitle>Archive Role</DialogTitle>
            <DialogDescription>
              Archive <strong>{archivingRole?.role}</strong>? Canon will stop creating new plans and updates for this role.
            </DialogDescription>
          </DialogHeader>
          <div className={dialogNoticeClass}>
            Active learning steps and draft suggestions for this role will be archived. Existing hire plans and saved evidence stay intact.
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setArchivingRole(null)} disabled={archiveRoleSaving}>Cancel</Button>
            <Button variant="destructive" onClick={() => void archiveRole()} disabled={archiveRoleSaving}>
              {archiveRoleSaving ? <IconLoader2 size={13} className="animate-spin" /> : null}
              Archive Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingTool !== null} onOpenChange={(open) => !open && setDeletingTool(null)}>
        <DialogContent className={`max-w-md ${dialogContentClass}`}>
          <DialogHeader>
            <DialogTitle>Remove Tool</DialogTitle>
            <DialogDescription>
              Remove <strong>{deletingTool?.tool_name}</strong> from your tool list? This won&apos;t affect tool requests already created for existing hires.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeletingTool(null)} disabled={deleteToolSaving}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteTool()} disabled={deleteToolSaving}>
              {deleteToolSaving ? <IconLoader2 size={13} className="animate-spin" /> : null}
              Remove Tool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingTool !== null} onOpenChange={(open) => !open && setEditingTool(null)}>
        <DialogContent className={`max-w-md ${dialogContentClass}`}>
          <DialogHeader>
            <DialogTitle>Edit Tool</DialogTitle>
            <DialogDescription>Update who owns this tool and which roles need it.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className={fieldLabelClass}>
                Tool Name <span className={requiredMarkClass}>*</span>
              </label>
              <ToolNameCombobox
                value={editTool.tool_name}
                onChange={(toolName) => setEditTool((p) => ({ ...p, tool_name: toolName }))}
                unavailableToolNames={editUnavailableToolNames}
              />
              {editToolNameConflict && (
                <p className="type-caption mt-1 text-[var(--amber-text)]">This tool is already configured.</p>
              )}
            </div>
            <div>
              <div className="mb-[5px] flex items-center justify-between gap-3">
                <label className="block type-body font-medium text-[var(--text-secondary)]">Roles</label>
                <span className="type-caption text-[var(--text-tertiary)]">{selectedRolesLabel(editTool.roles)}</span>
              </div>
              <RoleMultiSelect
                value={editTool.roles}
                onChange={(roles) => setEditTool((p) => ({ ...p, roles }))}
                roles={activeToolRoles}
              />
              <p className={fieldHintClass}>Choose every role that needs this tool, or use All roles when everyone needs it.</p>
            </div>
            <div>
              <label className={fieldLabelClass}>
                Owner <span className={requiredMarkClass}>*</span>
              </label>
              <SlackUserPicker
                value={editTool.owner}
                onChange={(user) => setEditTool((p) => ({ ...p, owner: user }))}
                placeholder="Search teammates..."
              />
              <p className={fieldHintClass}>Canon will message this owner when a hire needs the tool.</p>
            </div>
            {editTool.owner && (
              <div>
                <label className={fieldLabelClass}>Owner Slack ID</label>
                <Input value={editTool.owner.id} readOnly />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditingTool(null)} disabled={editToolSaving}>Cancel</Button>
            <Button onClick={() => void updateTool()} disabled={editToolSaving || !editTool.tool_name.trim() || !editTool.owner || editToolNameConflict}>
              {editToolSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconPencil size={13} />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addToolOpen}
        onOpenChange={(open) => {
          if (open) {
            setAddToolOpen(true);
          } else {
            closeAddTool();
          }
        }}
      >
        <DialogContent className={`max-w-md ${dialogContentClass}`}>
          <DialogHeader>
            <DialogTitle>Add Tool</DialogTitle>
            <DialogDescription>
              {addToolRole
                ? `Add a tool ${addToolRole} needs and the teammate who owns access.`
                : 'Add a tool this role needs and the teammate who owns access.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className={fieldLabelClass}>
                Tool Name <span className={requiredMarkClass}>*</span>
              </label>
              <ToolNameCombobox
                value={newTool.tool_name}
                onChange={(toolName) => setNewTool((p) => ({ ...p, tool_name: toolName }))}
              />
              {newToolAlreadyConfigured && (
                <p className="type-caption mt-1 text-[var(--amber-text)]">This tool already exists. Adding it here will include {addToolRole ?? 'this role'}.</p>
              )}
            </div>
            <div>
              <label className={fieldLabelClass}>
                Owner <span className={requiredMarkClass}>*</span>
              </label>
              <SlackUserPicker
                value={newTool.owner}
                onChange={(user) => setNewTool((p) => ({ ...p, owner: user }))}
                placeholder="Search teammates..."
              />
              <p className={fieldHintClass}>Canon will message this owner when a hire needs the tool.</p>
            </div>
            {newTool.owner && (
              <div>
                <label className={fieldLabelClass}>
                  Owner Slack ID
                </label>
                <Input value={newTool.owner.id} readOnly />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={closeAddTool} disabled={addToolSaving}>
              Cancel
            </Button>
            <Button onClick={() => void addTool()} disabled={addToolSaving || !newTool.tool_name.trim() || !newTool.owner || !addToolRole}>
              {addToolSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconTool size={13} />}
              Add Tool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
