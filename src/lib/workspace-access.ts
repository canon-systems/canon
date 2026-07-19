import { DEMO_WORKSPACE_TYPE } from '@/lib/demo-workspace';

type WorkspaceMetadataLike = Record<string, unknown> | null | undefined;

export type WorkspaceMembershipLike = {
  id?: string | null;
  role?: string | null;
  organization: {
    id: string;
    name?: string | null;
    slug?: string | null;
    publicMetadata?: WorkspaceMetadataLike;
  };
};

export type WorkspaceMembershipSummary = {
  membershipId: string | null;
  clerkOrgId: string;
  name: string;
  slug: string | null;
  role: string | null;
  isDemo: boolean;
};

export type WorkspaceMembershipGroups = {
  realWorkspaces: WorkspaceMembershipSummary[];
  demoWorkspaces: WorkspaceMembershipSummary[];
};

function parseIdList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function configuredDemoWorkspaceIds() {
  return [
    ...parseIdList(process.env.NEXT_PUBLIC_CANON_DEMO_CLERK_ORG_IDS),
    ...parseIdList(process.env.NEXT_PUBLIC_CANON_DEMO_CLERK_ORG_ID),
  ];
}

export function configuredDemoWorkspaceUrl() {
  return (process.env.NEXT_PUBLIC_CANON_DEMO_WORKSPACE_URL ?? '').trim();
}

export function isDemoWorkspaceClerkOrgId(
  clerkOrgId: string,
  demoClerkOrgIds: readonly string[] = configuredDemoWorkspaceIds()
) {
  return demoClerkOrgIds.includes(clerkOrgId);
}

export function isDemoWorkspaceOrganization(
  organization: { id: string; publicMetadata?: WorkspaceMetadataLike },
  demoClerkOrgIds: readonly string[] = configuredDemoWorkspaceIds()
) {
  return (
    isDemoWorkspaceClerkOrgId(organization.id, demoClerkOrgIds) ||
    organization.publicMetadata?.workspace_type === DEMO_WORKSPACE_TYPE
  );
}

export function summarizeWorkspaceMemberships(
  memberships: readonly WorkspaceMembershipLike[],
  options: { demoClerkOrgIds?: readonly string[] } = {}
): WorkspaceMembershipGroups {
  const demoClerkOrgIds = options.demoClerkOrgIds ?? configuredDemoWorkspaceIds();

  return memberships.reduce<WorkspaceMembershipGroups>(
    (groups, membership) => {
      const summary: WorkspaceMembershipSummary = {
        membershipId: membership.id ?? null,
        clerkOrgId: membership.organization.id,
        name: membership.organization.name || 'Canon Workspace',
        slug: membership.organization.slug ?? null,
        role: membership.role ?? null,
        isDemo: isDemoWorkspaceOrganization(membership.organization, demoClerkOrgIds),
      };

      if (summary.isDemo) {
        groups.demoWorkspaces.push(summary);
      } else {
        groups.realWorkspaces.push(summary);
      }

      return groups;
    },
    { realWorkspaces: [], demoWorkspaces: [] }
  );
}
