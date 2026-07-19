import 'server-only';

import type {
  AccessRequest,
  KnowledgeSource,
  MilestoneProposal,
  MilestoneProgressStatus,
  NewHireMilestonePathItem,
  OrgTool,
  RampDelivery,
  RampMilestone,
  ReadinessItem,
  RoleProfile,
  SourceOption,
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
    description: 'Own the technical path for enterprise opportunities from first discovery through technical win. Partner with account executives and customer stakeholders to turn a business problem into a clear technical point of view: the current workflow, the target outcome, the systems involved, and the decision that must be made. Lead architecture, security, identity, and data-boundary conversations; build demonstrations around the customer workflow; and keep the evaluation plan grounded in measurable proof rather than feature lists. Maintain the technical win plan through validation, with explicit owners, risks, proof points, and next decisions, then hand the full customer context to implementation without losing the reason the customer bought.',
  },
  {
    role: 'Implementation Engineer', baseline: 100, target: 55,
    description: 'Turn a signed customer outcome into a secure, measurable launch plan. Translate the commercial handoff into a delivery plan with a narrow first-value workflow, named customer and Novara owners, system dependencies, data requirements, and decision dates. Lead data and integration readiness, coordinate configuration and testing, and surface implementation risks before they become schedule surprises. Guide the customer from kickoff to production readiness with acceptance criteria, monitoring, support ownership, and an escalation path in place. Close the loop by documenting the result, the remaining adoption work, and the next value milestone for the account team.',
  },
  {
    role: 'Solutions Engineer', baseline: 90, target: 60,
    description: 'Connect customer problems to a credible technical path during the sales cycle. Run discovery that uncovers the current workflow, business impact, data and integration constraints, stakeholders, and the criteria for a technical decision. Use that context to build customer-specific demonstrations that show a realistic path to value, not a generic product tour. Create a validation plan with clear scope, owners, proof points, risks, and a decision date; keep the account team aligned as evidence arrives. When the opportunity moves forward, deliver a complete handoff that gives implementation the customer story, success criteria, commitments, and unresolved questions they need to launch well.',
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
  { key: 'maya-chen', first: 'Maya', last: 'Chen', role: 'AI Solutions Architect', daysAgo: 18, manager: 'Elena Torres', managerEmail: 'elena.torres@novara.cloud', statuses: ['verified', 'verified', 'needs_review', 'briefed', 'not_started'] },
  { key: 'jordan-brooks', first: 'Jordan', last: 'Brooks', role: 'Implementation Engineer', daysAgo: 33, manager: 'Samira Patel', managerEmail: 'samira.patel@novara.cloud', statuses: ['verified', 'verified', 'verified', 'needs_review', 'briefed'] },
  { key: 'priya-raman', first: 'Priya', last: 'Raman', role: 'Solutions Engineer', daysAgo: 52, manager: 'Marcus Lee', managerEmail: 'marcus.lee@novara.cloud', statuses: ['verified', 'verified', 'verified', 'verified', 'needs_review'] },
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

export function demoMilestoneProposals(): MilestoneProposal[] {
  const definitions = [
    {
      role: 'AI Solutions Architect', day: 22, title: 'Evaluation architecture decision record',
      capability: 'Create a concise technical decision record that connects the customer workflow to architecture choices, open risks, proof required, and the decision owner.',
      briefing: 'Prepare the hire to distinguish an architecture overview from an evaluation plan, including the questions that must be answered before a customer can approve a pilot.',
      trigger: 'A strategic opportunity moves from demonstration into a technical evaluation.',
      signals: ['Decision record names the customer decision owner and target date', 'Open architecture, identity, and data-boundary risks each have an owner'],
      retrieval: 'Recent technical evaluations, architecture reviews, security questions, and customer decision criteria.',
      rationale: 'Recent Meridian and Northwind reviews show that technical evaluations move faster when the decision record is written before the architecture review.',
      confidence: 0.92,
    },
    {
      role: 'AI Solutions Architect', day: 38, title: 'Executive technical value review',
      capability: 'Lead an executive technical value review that connects validated workflow results to the customer business outcome, remaining risk, and the path to a decision.',
      briefing: 'Give the hire examples of how account teams frame a technical readout for executive stakeholders without turning it into a generic product recap.',
      trigger: 'The customer has completed its core technical validation and is preparing an executive decision meeting.',
      signals: ['Readout includes workflow evidence, business impact, and unresolved risk', 'Account team agrees on the executive decision and follow-up owner'],
      retrieval: 'Executive value reviews, technical validation notes, and customer outcome statements.',
      rationale: 'Atlas renewal-risk discovery and recent executive reviews repeatedly connect technical proof to a named business decision.',
      confidence: 0.88,
    },
    {
      role: 'Implementation Engineer', day: 27, title: 'Customer acceptance test plan',
      capability: 'Build a customer acceptance test plan that covers the first value workflow, production-like data, success criteria, issue ownership, and sign-off.',
      briefing: 'Prepare the hire to convert a configured workflow into a testable customer commitment with a clear acceptance path and escalation route.',
      trigger: 'Configuration is ready for customer validation before the production readiness review.',
      signals: ['Acceptance plan names the workflow owner, test data owner, and sign-off owner', 'Failures have a severity, next step, and target resolution date'],
      retrieval: 'Implementation test plans, launch checklists, customer handoffs, and production readiness notes.',
      rationale: 'Redwood kickoff signals show that teams need a test plan before broad rollout discussions begin.',
      confidence: 0.91,
    },
    {
      role: 'Implementation Engineer', day: 45, title: 'Adoption handoff operating rhythm',
      capability: 'Define the post-launch operating rhythm for adoption, support, executive reporting, and the next expansion decision.',
      briefing: 'Show the hire how successful launch teams transfer ownership without losing the success metric, customer commitments, or open technical risks.',
      trigger: 'The first production workflow is live and the customer is moving into ongoing adoption.',
      signals: ['Account and support owners accept the handoff with current risks', 'Next value milestone and executive reporting cadence are agreed'],
      retrieval: 'Customer handoffs, adoption reviews, support escalations, and expansion plans.',
      rationale: 'Recent handoffs show fewer gaps when the adoption rhythm is defined before the initial launch closes.',
      confidence: 0.86,
    },
    {
      role: 'Solutions Engineer', day: 27, title: 'Technical champion enablement plan',
      capability: 'Create an enablement plan that gives the customer technical champion the workflow narrative, proof, and internal materials needed to build support for the evaluation.',
      briefing: 'Prepare the hire to identify the technical champion, the internal audience they need to influence, and the evidence they need to carry the customer story forward.',
      trigger: 'A qualified opportunity has a technical champion but needs broader stakeholder alignment.',
      signals: ['Champion has a tailored workflow narrative and technical proof', 'Stakeholder map identifies decision makers, reviewers, and follow-up owners'],
      retrieval: 'Discovery notes, customer stakeholder maps, technical demos, and evaluation follow-ups.',
      rationale: 'Northwind and Atlas discovery notes show that champions need reusable technical proof before executive alignment.',
      confidence: 0.89,
    },
    {
      role: 'Solutions Engineer', day: 43, title: 'Mutual technical close plan',
      capability: 'Produce a mutual close plan that names the remaining technical proof, customer owners, internal owners, dependencies, and the date each decision must be made.',
      briefing: 'Give the hire a practical structure for turning evaluation findings into a shared technical close plan instead of an informal list of follow-ups.',
      trigger: 'The opportunity is approaching a commercial decision with a small number of technical items still open.',
      signals: ['Every open technical item has an owner and decision date', 'Account team and customer agree on the final proof needed to proceed'],
      retrieval: 'Technical validation plans, late-stage opportunity reviews, security follow-ups, and customer decision dates.',
      rationale: 'Recent enterprise evaluations show that clear owners and dates prevent late technical work from delaying the customer decision.',
      confidence: 0.93,
    },
  ] as const;

  return definitions.map((definition, index) => ({
    id: `demo-proposal-${index + 1}`,
    organization_id: DEMO_ORGANIZATION_ID,
    role: definition.role,
    suggested_day_trigger: definition.day,
    title: definition.title,
    capability_outcome: definition.capability,
    briefing_goal: definition.briefing,
    real_work_trigger: definition.trigger,
    success_signals: [...definition.signals],
    retrieval_brief: definition.retrieval,
    evidence_requirements: [
      { type: 'communication_activity', label: 'Customer or internal decision context is documented', required: true, trust_level: 'medium' },
      { type: 'tool_activity', label: 'The planned artifact is created in the agreed workflow', required: true, trust_level: 'high' },
    ],
    source_evidence: [
      { provider: 'granola', label: 'Customer meeting library', url: null },
      { provider: 'slack', label: '#product-and-field', url: null },
    ],
    rationale: definition.rationale,
    confidence: definition.confidence,
    normalized_key: `${definition.role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${definition.day}-${definition.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    status: 'draft' as const,
    approved_milestone_id: null,
    approved_at: null,
    rejected_at: null,
    created_at: isoFromNow(-2, -(index + 1)),
    updated_at: isoFromNow(-1, -(index + 1)),
  }));
}

export function demoHires() {
  return hireDefinitions.map((hire) => ({
    id: `demo-hire-${hire.key}`,
    organization_id: DEMO_ORGANIZATION_ID,
    created_by: 'demo-owner',
    first_name: hire.first,
    last_name: hire.last,
    email: `${hire.first.toLowerCase()}.${hire.last.toLowerCase()}@novara.cloud`,
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
    ['Miro', 'AI Solutions Architect', 'Product Operations'],
    ['Salesforce', 'AI Solutions Architect', 'Revenue Systems'],
    ['GitHub', 'AI Solutions Architect', 'Developer Experience'],
    ['Zoom', 'AI Solutions Architect', 'Workplace Technology'],
    ['Linear', 'Implementation Engineer', 'Delivery Operations'],
    ['Notion', 'Implementation Engineer', 'Knowledge Operations'],
    ['Datadog', 'Implementation Engineer', 'Platform Operations'],
    ['Jira', 'Implementation Engineer', 'Delivery Operations'],
    ['Google Drive', 'Implementation Engineer', 'IT Operations'],
    ['Gong', 'Solutions Engineer', 'Revenue Enablement'],
    ['Salesforce', 'Solutions Engineer', 'Revenue Systems'],
    ['HubSpot', 'Solutions Engineer', 'Revenue Operations'],
    ['Zoom', 'Solutions Engineer', 'Workplace Technology'],
    ['Slack', null, 'IT Operations'],
  ] as const;
  return definitions.map(([tool, role, owner], index) => ({
    id: `demo-tool-${index + 1}`,
    organization_id: DEMO_ORGANIZATION_ID,
    tool_name: tool,
    role,
    owner_name: owner,
    owner_email: `${owner.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@novara.cloud`,
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
  const definitions: Array<{
    key: string;
    provider: KnowledgeSource['provider'];
    name: string;
    chunkCount: number;
    slackChannelId: string | null;
    slackChannelName: string | null;
  }> = [
    {
      key: 'product-and-field',
      provider: 'slack',
      name: 'product-and-field',
      chunkCount: 54,
      slackChannelId: 'CDEMO_PRODUCT_FIELD',
      slackChannelName: 'product-and-field',
    },
    {
      key: 'customer-meetings',
      provider: 'granola',
      name: 'Customer meeting library',
      chunkCount: 68,
      slackChannelId: null,
      slackChannelName: null,
    },
    {
      key: 'enterprise-email-threads',
      provider: 'gmail',
      name: 'Enterprise customer email threads',
      chunkCount: 36,
      slackChannelId: null,
      slackChannelName: null,
    },
    {
      key: 'implementation-inbox',
      provider: 'outlook',
      name: 'Implementation handoff inbox',
      chunkCount: 29,
      slackChannelId: null,
      slackChannelName: null,
    },
    {
      key: 'customer-calendar',
      provider: 'google_calendar',
      name: 'Customer-facing calendar',
      chunkCount: 18,
      slackChannelId: null,
      slackChannelName: null,
    },
  ];

  return definitions.map((definition, index) => ({
    id: `demo-source-${definition.key}`,
    organization_id: DEMO_ORGANIZATION_ID,
    provider: definition.provider,
    name: definition.name,
    slack_channel_id: definition.slackChannelId,
    slack_channel_name: definition.slackChannelName,
    status: 'active',
    last_synced_at: isoFromNow(0, -(index + 1)),
    chunk_count: definition.chunkCount,
    error_message: null,
    created_at: isoFromNow(-45),
  }));
}

export function demoKnowledgeSourceOptions(): SourceOption[] {
  return [
    { id: 'CDEMO_CUSTOMER_VOICE', name: 'customer-voice', provider: 'slack', member_count: 84, topic: 'Customer feedback, renewal themes, and product requests' },
    { id: 'CDEMO_SOLUTIONS_ENGINEERING', name: 'solutions-engineering', provider: 'slack', member_count: 41, topic: 'Discovery plans, technical validation, and demo feedback' },
    { id: 'CDEMO_IMPLEMENTATION_DELIVERY', name: 'implementation-delivery', provider: 'slack', member_count: 36, topic: 'Launch risks, implementation decisions, and handoffs' },
    { id: 'granola-strategic-accounts', name: 'Strategic account meeting transcripts', provider: 'granola', member_count: 0, topic: 'Customer calls and technical reviews' },
    { id: 'gmail-renewal-threads', name: 'Renewal and expansion email threads', provider: 'gmail', member_count: 0, topic: 'Enterprise customer email conversations' },
    { id: 'outlook-implementation-mailbox', name: 'Customer implementation mailbox', provider: 'outlook', member_count: 0, topic: 'Implementation decisions and customer handoffs' },
    { id: 'google-calendar-customer-meetings', name: 'Enterprise customer meetings', provider: 'google_calendar', member_count: 0, topic: 'Customer-facing meetings and technical reviews' },
  ];
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
  const sourceEvidenceByIndex = [
    [
      { provider: 'slack', source_name: '#product-and-field', source_type: 'slack_channel', channel_name: 'product-and-field', channel_id: 'CDEMO_PRODUCT_FIELD' },
      { provider: 'gmail', source_name: 'Enterprise renewal thread: Meridian Health', source_type: 'email_thread' },
    ],
    [
      { provider: 'granola', source_name: 'Northwind Logistics architecture review', source_type: 'transcript', meeting_date: isoFromNow(-3) },
      { provider: 'outlook', source_name: 'Implementation handoff inbox', source_type: 'email_thread' },
    ],
    [
      { provider: 'granola', source_name: 'Redwood Manufacturing demo review', source_type: 'transcript', meeting_date: isoFromNow(-4) },
      { provider: 'slack', source_name: '#product-and-field', source_type: 'slack_channel', channel_name: 'product-and-field', channel_id: 'CDEMO_PRODUCT_FIELD' },
    ],
    [
      { provider: 'granola', source_name: 'Redwood Manufacturing implementation kickoff', source_type: 'transcript', meeting_date: isoFromNow(-5) },
      { provider: 'outlook', source_name: 'Implementation handoff inbox', source_type: 'email_thread' },
    ],
    [
      { provider: 'gmail', source_name: 'Enterprise renewal thread: Atlas Bank', source_type: 'email_thread' },
      { provider: 'google_calendar', source_name: 'Customer-facing calendar', source_type: 'calendar_event' },
    ],
    [
      { provider: 'slack', source_name: '#product-and-field', source_type: 'slack_channel', channel_name: 'product-and-field', channel_id: 'CDEMO_PRODUCT_FIELD' },
      { provider: 'outlook', source_name: 'Implementation handoff inbox', source_type: 'email_thread' },
    ],
    [
      { provider: 'granola', source_name: 'Atlas Bank technical discovery', source_type: 'transcript', meeting_date: isoFromNow(-7) },
      { provider: 'google_calendar', source_name: 'Customer-facing calendar', source_type: 'calendar_event' },
    ],
    [
      { provider: 'granola', source_name: 'Summit Retail kickoff review', source_type: 'transcript', meeting_date: isoFromNow(-8) },
      { provider: 'outlook', source_name: 'Implementation handoff inbox', source_type: 'email_thread' },
    ],
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
      source_evidence: sourceEvidenceByIndex[index],
      signals_reviewed: 12 + index * 4,
      stale_knowledge_areas: index === 0 ? 2 : index % 3 === 0 ? 1 : 0,
      milestones_covered_percent: 76 + index * 2,
    },
    status,
    detected_at: isoFromNow(-(index + 1), -2),
    sent_at: status === 'sent' ? isoFromNow(-1) : null,
    created_at: isoFromNow(-(index + 2)),
    updated_at: isoFromNow(-(index + 1)),
  }));
}

export function demoMeetingPrep() {
  type DemoMeetingStatus = 'pending' | 'delivered' | 'waiting' | 'failed';
  const meetings: Array<[string, string, number, DemoMeetingStatus]> = [
    ['meridian', 'Meridian Health architecture review', 2, 'delivered'],
    ['northwind', 'Northwind Logistics executive value review', 4, 'waiting'],
    ['redwood', 'Redwood Manufacturing implementation kickoff', -2, 'delivered'],
    ['atlas', 'Atlas Bank technical discovery', 1, 'delivered'],
    ['summit', 'Summit Retail escalation follow-up', -5, 'delivered'],
  ];
  const briefingTextByKey: Record<string, string> = {
    meridian: [
      'Meeting focus',
      'Meridian Health is reviewing whether Novara Cloud can meet its architecture, identity, and data-boundary requirements before the pilot moves forward. The main risk is that the conversation turns into a generic platform walkthrough instead of answering the deployment questions blocking approval.',
      '',
      'What to lead with',
      'Open with the proposed deployment boundary: customer data stays in the Meridian workspace, identity flows through their existing SSO provider, and integration health is visible by workspace in the admin console. Tie each point back to the review goal: giving security and architecture leaders enough proof to approve a controlled pilot.',
      '',
      'Likely questions',
      'Expect questions about audit exports, workspace-level access, and who owns integration failures after launch. Use the current guidance: workspace-filtered audit exports are available for exports created after July 15, older exports should be regenerated, and launch ownership should be named before implementation kickoff.',
      '',
      'Recommended next step',
      'Leave the meeting with three named owners: Meridian identity owner, Meridian data owner, and Novara implementation owner. Confirm the proof each owner needs before the pilot approval date.',
    ].join('\n'),
    redwood: [
      'Meeting focus',
      'Redwood Manufacturing is entering kickoff with a clear first workflow but weak ownership around source data and support handoff. The goal is to prevent kickoff from becoming a broad rollout discussion before the first value metric is agreed.',
      '',
      'What to lead with',
      'Anchor the kickoff around the two-phase launch pattern. Phase one should prove the production scheduling workflow with production-like data, a named data owner, and one measurable value target. Phase two can expand only after support ownership and escalation paths are accepted.',
      '',
      'Customer context to use',
      'Recent implementation signals show launches move faster when the customer data owner is named before integration mapping. Redwood has not confirmed that owner yet, so treat it as the first dependency rather than an implementation detail.',
      '',
      'Recommended next step',
      'Ask Redwood to confirm the data owner and the baseline metric during kickoff. Do not leave the meeting with only a timeline; leave with owner, metric, first workflow, and risk owner.',
    ].join('\n'),
    atlas: [
      'Meeting focus',
      'Atlas Bank is early in technical discovery and is deciding whether Novara Cloud can support the renewal-risk workflow they want to prove this quarter. The important move is to connect data readiness to the business outcome before discussing features.',
      '',
      'Discovery angle',
      'Start with the business decision Atlas wants to make: which accounts need intervention before renewal risk becomes visible too late. Then test whether they have the data required to support that decision: usage trend, workflow mix, account owner, and executive outcome owner.',
      '',
      'Proof points to gather',
      'Listen for gaps in data ownership, identity boundaries, and how executive reviews are prepared today. If they ask for a demo, use the production-sized customer health view first, then show workflow automation second.',
      '',
      'Recommended next step',
      'End with a short validation plan: source data required, owner for each source, demo path to prepare, and the decision Atlas expects from technical validation.',
    ].join('\n'),
    summit: [
      'Meeting focus',
      'Summit Retail needs an escalation follow-up after a high-volume workflow hit the old API concurrency pattern. The goal is to rebuild confidence without overpromising a platform fix that is already covered by updated implementation guidance.',
      '',
      'What changed',
      'The current high-volume account guidance recommends a different concurrency pattern after the latest platform release. Implementation owners should replace the old rate-limit explanation and verify active launches that still reference it.',
      '',
      'How to handle the customer',
      'Acknowledge the impact, explain the updated pattern plainly, and separate what changes in configuration from what changes in customer expectations. Do not make this a generic reliability conversation; keep it tied to Summit Retail workflow volume and launch timeline.',
      '',
      'Recommended next step',
      'Send a written follow-up with the new concurrency pattern, the owner for implementation changes, and the date Novara will confirm the workflow is running under the updated guidance.',
    ].join('\n'),
  };
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
    briefText: status === 'delivered' ? briefingTextByKey[key] : null,
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
