import { describe, expect, it } from 'vitest';

import {
  isDemoWorkspaceClerkOrgId,
  isDemoWorkspaceOrganization,
  summarizeWorkspaceMemberships,
  type WorkspaceMembershipLike,
} from './workspace-access';

function membership(overrides: Partial<WorkspaceMembershipLike> = {}): WorkspaceMembershipLike {
  return {
    id: 'mem_123',
    role: 'org:admin',
    organization: {
      id: 'org_real',
      name: 'Acme',
      slug: 'acme',
    },
    ...overrides,
  };
}

describe('workspace access', () => {
  it('identifies configured demo workspaces by Clerk organization id', () => {
    expect(isDemoWorkspaceClerkOrgId('org_demo', ['org_demo'])).toBe(true);
    expect(isDemoWorkspaceClerkOrgId('org_real', ['org_demo'])).toBe(false);
  });

  it('identifies demo workspaces by Clerk public metadata', () => {
    expect(isDemoWorkspaceOrganization({
      id: 'org_demo_without_env',
      publicMetadata: { workspace_type: 'demo' },
    })).toBe(true);
  });

  it('separates real user workspaces from the demo workspace', () => {
    const groups = summarizeWorkspaceMemberships(
      [
        membership(),
        membership({
          id: 'mem_demo',
          role: 'org:member',
          organization: {
            id: 'org_demo',
            name: 'Canon Demo',
            slug: 'canon-demo',
            publicMetadata: { workspace_type: 'demo' },
          },
        }),
      ],
      { demoClerkOrgIds: [] }
    );

    expect(groups.realWorkspaces).toEqual([
      {
        membershipId: 'mem_123',
        clerkOrgId: 'org_real',
        name: 'Acme',
        slug: 'acme',
        role: 'org:admin',
        isDemo: false,
      },
    ]);
    expect(groups.demoWorkspaces).toEqual([
      {
        membershipId: 'mem_demo',
        clerkOrgId: 'org_demo',
        name: 'Canon Demo',
        slug: 'canon-demo',
        role: 'org:member',
        isDemo: true,
      },
    ]);
  });
});
