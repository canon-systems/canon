import 'server-only';

import type {
  AccessRequest,
  KnowledgeSource,
  MilestoneProgressStatus,
  NewHireMilestonePathItem,
  OrgTool,
  RampDelivery,
  RampMilestone,
  ReadinessItem,
  RoleProfile,
} from '@/types/onboarding';
import type { MilestoneCheckRun } from '@/lib/onboarding/milestone-checks';

export const DEMO_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000042';

function isoFromNow(days = 0, hours = 0) {
  return new Date(Date.now() + ((days * 24 + hours) * 60 * 60 * 1000)).toISOString();
}

function dateFromNow(days: number) {
  return isoFromNow(days).slice(0, 10);
}

type MilestoneDefinition = [number, string, string, string, string[]];

const roleDefinitions = [
  {
    role: 'AI Solutions Architect', baseline: 90, target: 45,
    description: 'Own technical discovery, solution design, tailored demonstrations, and the technical win for enterprise opportunities at Novara Cloud.',
  },
  {
    role: 'Implementation Engineer', baseline: 100, target: 55,
    description: 'Translate customer outcomes into a secure implementation plan, guide launch decisions, and move Novara Cloud customers to measurable value.',
  },
  {
    role: 'Solutions Engineer', baseline: 90, target: 60,
    description: 'Own technical discovery, demonstrations, validation plans, and the customer handoff for Novara Cloud opportunities.',
  },
] as const;

const milestoneDefinitions: Record<string, MilestoneDefinition[]> = {
  'AI Solutions Architect': [
    [1, 'Platform fluency and customer story', 'Explain Novara Cloud architecture, core workflows, and the customer outcomes behind each product surface.', 'The hire receives platform access and prepares a five-minute product narrative for a manager.', ['Manager confirms a clear platform narrative', 'Product workspace activity is visible']],
    [7, 'Outcome-led discovery', 'Run a discovery conversation that connects business goals, technical constraints, and measurable success criteria.', 'The hire leads a discovery call for a qualified enterprise opportunity.', ['Discovery notes capture the business outcome', 'Technical constraints and decision process are documented']],
    [15, 'Tailored technical demonstration', 'Deliver a focused demonstration built around the customer workflow instead of a generic feature tour.', 'The hire builds and presents a demo for a live opportunity or realistic review panel.', ['Demo workspace created', 'Feedback confirms the story follows the customer workflow']],
    [30, 'Security and architecture alignment', 'Lead a technical review that answers deployment, data boundary, identity, and integration questions with confidence.', 'A prospect requests a security or architecture review before moving forward.', ['Architecture notes shared', 'Open security questions have owners and next steps']],
    [45, 'Technical win plan', 'Own the technical success plan from discovery through validation, including risks, proof points, and decision criteria.', 'The hire is assigned a complex opportunity entering technical validation.', ['Technical win plan is complete', 'Manager verifies risks and proof points are current']],
  ],
  'Implementation Engineer': [
    [1, 'Implementation operating model', 'Explain the launch lifecycle, ownership model, and decisions required before configuration starts.', 'The hire reviews a signed customer handoff and drafts the launch plan.', ['Launch plan includes owners and dependencies', 'Outcomes and decision dates are clear']],
    [10, 'Data and integration readiness', 'Assess source data, authentication, integration limits, and operational ownership before build work begins.', 'The customer submits its initial technical design and sample data.', ['Readiness assessment identifies blockers', 'Mitigation owners are assigned']],
    [20, 'First value workflow', 'Design and deliver a narrow production workflow that proves value without creating long-term rework.', 'The customer approves the first use case for implementation.', ['Workflow runs with production-like data', 'Acceptance criteria pass']],
    [35, 'Production readiness review', 'Lead the final review for reliability, support ownership, monitoring, and change management.', 'The implementation reaches its production readiness checkpoint.', ['Readiness checklist approved', 'Support and escalation paths are documented']],
    [55, 'Customer handoff and expansion plan', 'Transfer ownership cleanly while preserving decisions, risks, adoption signals, and the next value milestone.', 'The initial implementation is live and ready to move into the ongoing account rhythm.', ['Handoff accepted', 'Next value milestone and adoption owner are confirmed']],
  ],
  'Solutions Engineer': [
    [1, 'Product story and sales motion', 'Explain the Novara Cloud product story, sales stages, and the technical decision expected at each stage.', 'The hire receives platform access and reviews two recent enterprise wins.', ['Manager confirms a clear product narrative', 'Technical decisions are understood']],
    [10, 'Technical discovery', 'Lead discovery that connects the business outcome to the current workflow, data, integrations, and evaluation criteria.', 'The hire leads technical discovery for a qualified opportunity.', ['Discovery notes include outcome and workflow', 'Decision criteria are documented']],
    [20, 'Customer-specific demonstration', 'Build and deliver a demonstration around the customer workflow, risks, and success criteria.', 'The hire prepares a demonstration for a live opportunity or manager review panel.', ['Demo environment is ready', 'Customer proof points drive the story']],
    [35, 'Technical validation plan', 'Create a validation plan with scope, owners, proof points, risks, and a clear technical decision date.', 'The opportunity moves from demonstration into technical validation.', ['Validation plan is approved', 'Risks and proof owners are current']],
    [50, 'Closed-loop customer handoff', 'Transfer the technical context, decisions, risks, and success criteria into implementation without losing the customer story.', 'The opportunity completes technical validation and moves toward implementation.', ['Implementation owner accepts the handoff', 'Decisions and success criteria are documented']],
  ],
};

const hireDefinitions = [
  { key: 'maya-chen', first: 'Maya', last: 'Chen', role: 'AI Solutions Architect', daysAgo: 18, manager: 'Elena Torres', managerEmail: 'elena.torres@novara.example', statuses: ['verified', 'verified', 'needs_review', 'briefed', 'not_started'] },
  { key: 'jordan-brooks', first: 'Jordan', last: 'Brooks', role: 'Implementation Engineer', daysAgo: 33, manager: 'Samira Patel', managerEmail: 'samira.patel@novara.example', statuses: ['verified', 'verified', 'verified', 'needs_review', 'briefed'] },
  { key: 'priya-raman', first: 'Priya', last: 'Raman', role: 'Solutions Engineer', daysAgo: 52, manager: 'Marcus Lee', managerEmail: 'marcus.lee@novara.example', statuses: ['verified', 'verified', 'verified', 'verified', 'needs_review'] },
] as const;

function milestoneId(role: string, day: number) {
  return `demo-milestone-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${day}`;
}

export function demoRoleProfiles(): RoleProfile[] {
  return roleDefinitions.map((definition, index) => ({
    id: `demo-role-${index + 1}`,
    organization_id: DEMO_ORGANIZATION_ID,
    role: definition.role,
    job_description: definition.description,
    baseline_ramp_days: definition.baseline,
    target_ramp_days: definition.target,
    status: 'active',
    display_order: (index + 1) * 10,
    created_at: isoFromNow(-90),
    updated_at: isoFromNow(-1),
  }));
}

export function demoMilestones(): RampMilestone[] {
  return Object.entries(milestoneDefinitions).flatMap(([role, definitions]) => definitions.map(([day, title, outcome, trigger, signals]) => ({
    id: milestoneId(role, day),
    organization_id: DEMO_ORGANIZATION_ID,
    role,
    day_trigger: day,
    title,
    description: outcome,
    knowledge_query: `${role} ${title} customer examples process proof`,
    capability_outcome: outcome,
    briefing_goal: `Give the hire the context, examples, and decision framework needed for ${title.toLowerCase()}.`,
    real_work_trigger: trigger,
    success_signals: signals,
    retrieval_brief: `${role} guidance, customer examples, operating standards, and proof for ${title}`,
    evidence_requirements: [
      { type: 'communication_activity', label: 'Relevant customer or team communication', required: true, trust_level: 'medium' },
      { type: 'tool_activity', label: 'Work completed in a connected tool', required: true, trust_level: 'high' },
    ],
    source_evidence: [{ provider: 'granola', label: 'Novara customer meeting library', url: null }],
    confidence: 0.91,
    status: 'active',
    approved_from_proposal_id: null,
    created_at: isoFromNow(-75),
    updated_at: isoFromNow(-1),
  })));
}

export function demoHires() {
  return hireDefinitions.map((hire) => ({
    id: `demo-hire-${hire.key}`,
    organization_id: DEMO_ORGANIZATION_ID,
    created_by: 'demo-owner',
    first_name: hire.first,
    last_name: hire.last,
    email: `${hire.first.toLowerCase()}.${hire.last.toLowerCase()}@novara.example`,
    role: hire.role,
    start_date: dateFromNow(-hire.daysAgo),
    ramp_day: hire.daysAgo,
    slack_user_id: `UDEMO_${hire.first.toUpperCase()}`,
    manager_name: hire.manager,
    manager_email: hire.managerEmail,
    manager_slack_user_id: `UDEMO_MANAGER_${hire.key}`,
    manager_chat_provider: 'slack',
    manager_chat_target_id: `UDEMO_MANAGER_${hire.key}`,
    status: 'active' as const,
    created_at: isoFromNow(-hire.daysAgo - 5),
    updated_at: isoFromNow(0, -2),
  }));
}

export function demoTools(): OrgTool[] {
  const definitions: Array<[string, string | null, string]> = [
    ['Gong', 'AI Solutions Architect', 'Revenue Enablement'],
    ['Novara Cloud', 'AI Solutions Architect', 'Product Operations'],
    ['Salesforce', 'AI Solutions Architect', 'Revenue Systems'],
    ['Linear', 'Implementation Engineer', 'Delivery Operations'],
    ['Notion', 'Implementation Engineer', 'Knowledge Operations'],
    ['Novara Cloud', 'Implementation Engineer', 'Platform Operations'],
    ['Gong', 'Solutions Engineer', 'Revenue Enablement'],
    ['Salesforce', 'Solutions Engineer', 'Revenue Systems'],
    ['Slack', null, 'IT Operations'],
  ];
  return definitions.map(([tool, role, owner], index) => ({
    id: `demo-tool-${index + 1}`,
    organization_id: DEMO_ORGANIZATION_ID,
    tool_name: tool,
    role,
    owner_name: owner,
    owner_email: `${owner.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@novara.example`,
    owner_slack_id: `UDEMO_OWNER_${index + 1}`,
    created_at: isoFromNow(-60),
  }));
}

function accessRequestsForHire(hireKey: string, role: string): AccessRequest[] {
  const hireId = `demo-hire-${hireKey}`;
  const relevant = demoTools().filter((tool) => tool.role === role || tool.role === null).slice(0, 4);
  const statusSets: Record<string, AccessRequest['status'][]> = {
    'maya-chen': ['confirmed', 'granted', 'sent', 'pending'],
    'jordan-brooks': ['confirmed', 'confirmed', 'granted', 'sent'],
    'priya-raman': ['confirmed', 'confirmed', 'confirmed', 'granted'],
  };
  return relevant.map((tool, index) => {
    const status = statusSets[hireKey]?.[index] ?? 'pending';
    return {
      id: `demo-access-${hireKey}-${index + 1}`,
      new_hire_id: hireId,
      tool_name: tool.tool_name,
      requested_from_name: tool.owner_name,
      requested_from_email: tool.owner_email,
      requested_from_slack_id: tool.owner_slack_id,
      status,
      sent_at: status === 'pending' ? null : isoFromNow(-16 + index),
      resent_at: null,
      granted_at: ['granted', 'confirmed'].includes(status) ? isoFromNow(-13 + index) : null,
      confirmed_at: status === 'confirmed' ? isoFromNow(-11 + index) : null,
      created_at: isoFromNow(-20),
    };
  });
}

export function demoHireDetail(id: string) {
  const definition = hireDefinitions.find((hire) => `demo-hire-${hire.key}` === id);
  const hire = demoHires().find((candidate) => candidate.id === id);
  if (!definition || !hire) return null;
  const milestones = demoMilestones().filter((milestone) => milestone.role === definition.role);
  const accessRequests = accessRequestsForHire(definition.key, definition.role);
  const milestonePath: NewHireMilestonePathItem[] = milestones.map((milestone, index) => {
    const status = definition.statuses[index] as MilestoneProgressStatus;
    const evidenceAt = status === 'verified' || status === 'needs_review' ? isoFromNow(-(Math.max(1, 14 - index * 3))) : null;
    return {
      milestone,
      progress: {
        id: `demo-progress-${definition.key}-${index + 1}`,
        new_hire_id: id,
        milestone_id: milestone.id,
        status,
        current_confidence: status === 'verified' ? 0.94 : status === 'needs_review' ? 0.76 : status === 'briefed' ? 0.35 : 0,
        first_briefed_at: index <= 3 ? isoFromNow(-(18 - index * 3)) : null,
        last_evidence_at: evidenceAt,
        verified_at: status === 'verified' ? evidenceAt : null,
        created_at: isoFromNow(-30),
        updated_at: evidenceAt ?? isoFromNow(0, -4),
      },
      evidence: evidenceAt ? [{
        id: `demo-evidence-${definition.key}-${index + 1}`,
        progress_id: `demo-progress-${definition.key}-${index + 1}`,
        new_hire_id: id,
        milestone_id: milestone.id,
        evidence_type: index % 2 === 0 ? 'tool_activity' : 'communication_activity',
        trust_level: status === 'verified' ? 'high' : 'medium',
        confidence: status === 'verified' ? 0.94 : 0.76,
        source: index % 2 === 0 ? 'notion' : 'slack',
        source_event_id: null,
        source_url: null,
        metadata: {
          excerpt: status === 'verified'
            ? `${definition.first} completed the customer-facing work and documented the decision, evidence, and next step.`
            : `${definition.first} completed the work; Canon found strong evidence and queued it for manager confirmation.`,
          reason: status === 'needs_review' ? 'The final customer outcome needs manager confirmation.' : 'Connected activity matches the required proof.',
          needs_manager_review: status === 'needs_review',
        },
        created_by: null,
        created_at: evidenceAt,
      }] : [],
      access_ready: accessRequests.filter((request) => ['granted', 'confirmed'].includes(request.status)).length >= 2,
      required_tools: accessRequests.slice(0, 2).map((request) => request.tool_name),
    };
  });
  const deliveries: RampDelivery[] = milestones.slice(0, 2).map((milestone, index) => ({
    id: `demo-delivery-${definition.key}-${index + 1}`,
    new_hire_id: id,
    milestone_id: milestone.id,
    delivery_status: 'delivered',
    delivery_channel: 'slack',
    content_delivered: `Learning brief: ${milestone.title}`,
    slack_ts: null,
    delivered_at: isoFromNow(-(20 - index * 6)),
    error_message: null,
    created_at: isoFromNow(-22),
    milestone,
  }));
  const checks: MilestoneCheckRun[] = [{
    id: `demo-check-${definition.key}`,
    organization_id: DEMO_ORGANIZATION_ID,
    new_hire_id: id,
    milestone_id: milestones[Math.min(2, milestones.length - 1)]?.id ?? null,
    trigger_type: 'scheduled',
    outcome: 'needs_review',
    sources_checked: ['slack', 'notion', 'gmail'],
    source_event_ids: [],
    activity_checked: 18 + hireDefinitions.indexOf(definition) * 7,
    summary: `Canon checked recent work for ${definition.first} and found verified progress plus one item ready for manager review.`,
    started_at: isoFromNow(0, -3),
    completed_at: isoFromNow(0, -3),
    created_at: isoFromNow(0, -3),
  }];
  return {
    hire,
    deliveries,
    access_requests: accessRequests,
    next_milestone: milestones.find((milestone) => milestone.day_trigger > hire.ramp_day) ?? null,
    milestone_path: milestonePath,
    milestone_checks: checks,
  };
}

export function demoKnowledgeSources(): KnowledgeSource[] {
  return [
    ['customer-meetings', 'Customer meeting library', 68],
    ['product-deep-dives', 'Product deep dives', 42],
    ['win-loss-reviews', 'Win and loss reviews', 31],
  ].map(([key, name, count], index) => ({
    id: `demo-source-${key}`,
    organization_id: DEMO_ORGANIZATION_ID,
    provider: 'granola',
    name: String(name),
    slack_channel_id: null,
    slack_channel_name: null,
    status: 'active',
    last_synced_at: isoFromNow(0, -(index + 1)),
    chunk_count: Number(count),
    error_message: null,
    created_at: isoFromNow(-45),
  }));
}

export function demoReadinessItems(): ReadinessItem[] {
  const definitions = [
    ['product_change', 'New enterprise packaging changes how overages are explained', 'The enterprise plan now separates committed workflow volume from burst usage. Customer-facing teams need a simple explanation before the next renewal and expansion conversations.', 'Update the packaging talk track and add one account-specific usage example to every upcoming executive review.', ['AI Solutions Architect', 'Solutions Engineer'], 'high', 'draft', 'slack'],
    ['customer_objection', 'Security teams are asking for the deployment boundary earlier', 'Three enterprise evaluations raised data-boundary and identity questions before technical validation began.', 'Move the deployment boundary diagram into the first technical discovery follow-up.', ['AI Solutions Architect', 'Solutions Engineer'], 'high', 'reviewed', 'granola'],
    ['demo_guidance', 'Workflow latency should be shown with production-sized data', 'Small sample demonstrations are creating unrealistic performance expectations.', 'Add a production-scale dataset option to the demo checklist.', ['AI Solutions Architect', 'Solutions Engineer'], 'medium', 'draft', 'granola'],
    ['implementation_pattern', 'Two-phase launches are reaching first value faster', 'Recent launches that separated the first measurable workflow from broader rollout work reached production sooner.', 'Use a two-phase launch template and define the first value metric during kickoff.', ['Implementation Engineer'], 'high', 'draft', 'granola'],
    ['customer_objection', 'Renewal conversations need usage trend context before executive reviews', 'Account teams need the trend, workflow mix, and business outcome behind current usage totals.', 'Include a 90-day usage trend and the top outcome-producing workflow in every renewal briefing.', ['Solutions Engineer'], 'medium', 'draft', 'granola'],
    ['product_change', 'API rate-limit guidance changed for high-volume accounts', 'The recommended concurrency pattern changed after the latest platform release.', 'Replace the old guidance and alert implementation owners for active high-volume launches.', ['Implementation Engineer', 'AI Solutions Architect'], 'high', 'sent', 'slack'],
    ['demo_guidance', 'The best discovery calls connect data readiness to business outcomes', 'Recent wins tested data availability and ownership while the business outcome was still being defined.', 'Add two data-readiness questions to the discovery guide.', ['AI Solutions Architect', 'Solutions Engineer'], 'medium', 'draft', 'granola'],
    ['implementation_pattern', 'Customer handoffs work better when success criteria are captured in kickoff', 'Implementations with measurable criteria and a named executive outcome owner have fewer handoff gaps.', 'Require a success metric, baseline, target, and executive owner before build work begins.', ['Implementation Engineer'], 'medium', 'draft', 'granola'],
  ] as const;
  return definitions.map(([category, title, summary, action, roles, impact, status, source], index) => ({
    id: `demo-readiness-${index + 1}`,
    organization_id: DEMO_ORGANIZATION_ID,
    category,
    title,
    summary,
    recommended_action: action,
    impact_level: impact,
    affected_roles: [...roles],
    source,
    source_url: null,
    source_metadata: {
      source_evidence: [{ provider: source, source_name: source === 'granola' ? 'Enterprise customer review' : 'Product launch discussion' }],
      signal_count: 3 + (index % 4),
    },
    status,
    detected_at: isoFromNow(-(index + 1), -2),
    sent_at: status === 'sent' ? isoFromNow(-1) : null,
    created_at: isoFromNow(-(index + 2)),
    updated_at: isoFromNow(-(index + 1)),
  }));
}

export function demoMeetingPrep() {
  const meetings = [
    ['atlas', 'Atlas Bank technical discovery', 1, 'pending'],
    ['meridian', 'Meridian Health architecture review', 2, 'delivered'],
    ['northwind', 'Northwind Logistics executive value review', 4, 'waiting'],
    ['redwood', 'Redwood Manufacturing implementation kickoff', -2, 'delivered'],
    ['summit', 'Summit Retail escalation follow-up', -5, 'failed'],
  ] as const;
  const upcoming = meetings.filter((meeting) => meeting[2] >= 0).map(([key, title, day, status]) => ({
    id: `demo-meeting-${key}`,
    provider: 'outlook',
    providerLabel: 'Outlook',
    title,
    startAt: isoFromNow(day, day === 2 ? 3 : -3),
    endAt: isoFromNow(day, day === 2 ? 4 : -2),
    meetingUrl: 'https://meet.example/demo-room',
    customerDomain: `${key}.example`,
    briefingStatus: status,
    recipients: status === 'waiting' ? [] : ['Elena Torres'],
  }));
  const history = meetings.filter((meeting) => meeting[3] !== 'waiting').map(([key, title, day, status]) => ({
    id: `demo-briefing-${key}`,
    meetingId: `demo-meeting-${key}`,
    meetingTitle: title,
    meetingStartAt: isoFromNow(day),
    recipient: 'Elena Torres',
    status,
    reason: status === 'failed' ? 'Slack delivery was unavailable during the last attempt.' : null,
    briefText: status === 'delivered' ? 'Customer objective\nAlign the meeting to the customer outcome and confirm the technical decision required.\n\nRecommended next step\nConfirm the owner, proof point, and date for the next customer milestone.' : null,
    attempts: status === 'failed' ? 2 : 1,
    deliveredAt: status === 'delivered' ? isoFromNow(-1) : null,
    lastAttemptAt: isoFromNow(0, -3),
    permalink: status === 'delivered' ? 'https://slack.com/app_redirect?channel=demo' : null,
  }));
  return {
    calendar: {
      connected: true,
      providers: [{ provider: 'outlook', label: 'Outlook', connected: true, syncStatus: 'synced', lastSyncedAt: isoFromNow(0, -1), error: null }],
      lastSyncedAt: isoFromNow(0, -1),
    },
    summary: { upcoming: upcoming.length, delivered: history.filter((item) => item.status === 'delivered').length, needsAttention: history.filter((item) => item.status === 'failed').length },
    upcoming,
    history,
    permissions: { canSync: false },
  };
}

export function demoConnections() {
  return ['granola', 'outlook', 'slack'].map((provider, index) => ({
    id: `demo-connection-${provider}`,
    provider,
    connection_id: `demo:${provider}`,
    status: 'active',
    metadata: { source: provider === 'slack' ? 'native' : 'nango', demo: true },
    created_at: isoFromNow(-(8 - index)),
    updated_at: isoFromNow(0, -(index + 1)),
    platform: provider === 'slack' ? 'native' : 'nango',
  }));
}

export function demoDeliverySettings() {
  return {
    channelIds: ['CDEMO_PRODUCT_FIELD'],
    channelNames: ['product-and-field'],
    userIds: ['UDEMO_ELENA'],
    weeklyDigestEnabled: true,
    digestWeekday: 1,
    digestHourUtc: 13,
    meetingPrepEnabled: true,
    meetingPrepMinutesBefore: 45,
    lastDigestSentAt: isoFromNow(-7),
    targets: [
      { id: 'demo-target-channel', provider: 'slack', targetType: 'channel', targetId: 'CDEMO_PRODUCT_FIELD', targetName: 'product-and-field', enabled: true },
      { id: 'demo-target-manager', provider: 'slack', targetType: 'dm', targetId: 'UDEMO_ELENA', targetName: 'Elena Torres', enabled: true },
    ],
  };
}
