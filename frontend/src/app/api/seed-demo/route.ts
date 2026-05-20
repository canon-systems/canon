import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgoDate(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Demo hires — cover every status and ramp stage
// ---------------------------------------------------------------------------

const DEMO_HIRES = [
  // Day 1 — just started, shows the "everything pending" fresh state
  {
    name: 'Alex Kim',
    email: 'alex.kim@demo.usecanon.com',
    role: 'AI Solutions Architect' as const,
    start_date: daysAgoDate(1),
    ramp_day: 1,
    status: 'active' as const,
    slack_user_id: 'U0DEMO001',
  },
  // Day 7 — first milestone delivered, access in mixed state
  {
    name: 'Sarah Chen',
    email: 'sarah.chen@demo.usecanon.com',
    role: 'AI Solutions Architect' as const,
    start_date: daysAgoDate(7),
    ramp_day: 7,
    status: 'active' as const,
    slack_user_id: 'U0DEMO002',
  },
  // Day 14 — two milestones delivered, first access granted
  {
    name: 'Priya Patel',
    email: 'priya.patel@demo.usecanon.com',
    role: 'Implementation Engineer' as const,
    start_date: daysAgoDate(14),
    ramp_day: 14,
    status: 'active' as const,
    slack_user_id: 'U0DEMO003',
  },
  // Day 30 — includes a failed delivery to show error state
  {
    name: 'Marcus Johnson',
    email: 'marcus.johnson@demo.usecanon.com',
    role: 'Solutions Engineer' as const,
    start_date: daysAgoDate(30),
    ramp_day: 30,
    status: 'active' as const,
    slack_user_id: null, // no Slack ID — causes a failed delivery
  },
  // Day 45 — paused, shows paused state + stalled access on dashboard
  {
    name: 'Jordan Lee',
    email: 'jordan.lee@demo.usecanon.com',
    role: 'Implementation Engineer' as const,
    start_date: daysAgoDate(45),
    ramp_day: 45,
    status: 'paused' as const,
    slack_user_id: 'U0DEMO005',
  },
  // Day 60 — deep into ramp, stalled access visible on dashboard
  {
    name: 'Tom Rivera',
    email: 'tom.rivera@demo.usecanon.com',
    role: 'Solutions Engineer' as const,
    start_date: daysAgoDate(60),
    ramp_day: 60,
    status: 'active' as const,
    slack_user_id: 'U0DEMO006',
  },
  // Day 90 — completed ramp, shows the completed state
  {
    name: 'Sam Taylor',
    email: 'sam.taylor@demo.usecanon.com',
    role: 'AI Solutions Architect' as const,
    start_date: daysAgoDate(90),
    ramp_day: 90,
    status: 'completed' as const,
    slack_user_id: 'U0DEMO007',
  },
] as const;

// ---------------------------------------------------------------------------
// Knowledge sources — cover every status badge
// ---------------------------------------------------------------------------

const DEMO_KNOWLEDGE_SOURCES = [
  {
    provider: 'slack' as const,
    name: '#general-sales',
    slack_channel_id: 'C0DEMO001',
    slack_channel_name: 'general-sales',
    status: 'active' as const,
    chunk_count: 247,
    last_synced_at: daysAgoIso(0),
    error_message: null,
  },
  {
    provider: 'slack' as const,
    name: '#cs-team',
    slack_channel_id: 'C0DEMO002',
    slack_channel_name: 'cs-team',
    status: 'active' as const,
    chunk_count: 183,
    last_synced_at: daysAgoIso(1),
    error_message: null,
  },
  {
    provider: 'slack' as const,
    name: '#product-updates',
    slack_channel_id: 'C0DEMO003',
    slack_channel_name: 'product-updates',
    status: 'active' as const,
    chunk_count: 94,
    last_synced_at: daysAgoIso(3),
    error_message: null,
  },
  {
    // Shows the error state with a real-looking error message
    provider: 'slack' as const,
    name: '#engineering-all',
    slack_channel_id: 'C0DEMO004',
    slack_channel_name: 'engineering-all',
    status: 'error' as const,
    chunk_count: 0,
    last_synced_at: daysAgoIso(2),
    error_message: 'Slack API error: missing_scope — the bot requires channels:history permission. Re-install the Canon app with updated scopes.',
  },
  {
    // Shows the pending / never-synced state
    provider: 'slack' as const,
    name: '#new-hire-announcements',
    slack_channel_id: 'C0DEMO005',
    slack_channel_name: 'new-hire-announcements',
    status: 'pending' as const,
    chunk_count: 0,
    last_synced_at: null,
    error_message: null,
  },
] as const;

// ---------------------------------------------------------------------------
// Delivery content — realistic AI-generated summaries per role × milestone day
// ---------------------------------------------------------------------------

const DELIVERY_CONTENT: Record<string, Record<number, string>> = {
  'AI Solutions Architect': {
    1: `Welcome to the team! Here's what Canon pulled together for your first day:\n\nOur sales cycle averages 42 days for mid-market accounts. You'll be embedded with an Account Executive from first demo through close — your technical credibility is the key differentiator. The #general-sales channel is your real-time pulse on active deals. First week priority: shadow two discovery calls, get access to Gong, and review the last 5 won-deal recordings. Your manager will set up a weekly 1:1 to review your pipeline. Welcome aboard!`,
    7: `One week in — great start! A few things that came up this week:\n\nThree things to have sharp answers for: (1) Customers are asking more about our enterprise AI capabilities — know that story cold. (2) The TechCorp deal needs a custom demo environment next week — loop in Engineering early. (3) Our standard SOC 2 deck is outdated, use the version in the Sales shared drive (updated last Tuesday). Week 2 focus: own your first technical discovery call end-to-end.`,
    14: `Two weeks in! Synthesizing what's been surfacing in your channels:\n\nYou've shadowed 4 calls and run 1 solo discovery. The pattern to internalize: demos that open with a customer-specific pain point close 2.3× faster than generic walkthroughs — Gong data backs this. Your pipeline has 3 deals at various stages. This week, focus on getting TechCorp to a technical win criteria document before their POC. Month-1 goal: run your first full demo cycle independently.`,
    30: `One month down — you're building real momentum:\n\nYou've run 6 demos, 2 POCs, and contributed to your first technical close. Win rate when SAs are embedded from first call: 68% vs 41% when brought in late — use that data to pull yourself in earlier. Focus for month 2: build a repeatable discovery framework and get your Gong score above 75. Your manager wants to see you lead a QBR next quarter.`,
    45: `Six weeks in — great progress on your first independent deal cycles:\n\nYour pipeline shows 2 deals where you're running the full cycle solo. Review each against the discovery checklist — the top patterns from recent wins all include a signed technical win criteria doc before POC kickoff. If you haven't sent that to TechCorp yet, do it today. One area to sharpen: executive-level ROI framing. Bring your manager to your next C-suite meeting and debrief afterward.`,
    60: `Two months in — you're fully contributing:\n\nYou've contributed to 11 deals, closed 3 technical wins, and your average POC-to-close is 26 days (team avg: 34). Highest priority this week: Meridian renewal at risk — they're evaluating a competitor. Schedule a technical differentiation session before their board meeting Thursday. You're on track for a strong 90-day review.`,
    90: `Ramp complete — 90 days in:\n\nYou've built a strong foundation: 18 deals touched, 6 technical wins, 2 expansions influenced. The team's avg is 4 wins at 90 days — you're 50% above benchmark. Key areas to continue developing: enterprise security conversations and executive-level ROI framing. Your next 90 days: own a full territory and start mentoring the next incoming AI SA. Outstanding work — welcome to full productivity.`,
  },
  'Solutions Engineer': {
    1: `Welcome! As a Solutions Engineer you own the full technical sale from demo to POC to handoff. Day 1 priorities:\n\nGet access to Salesforce and Gong (check your email — provisioning request sent). The #cs-team channel surfaces real customer pain points daily. Key relationship to build this week: the CS lead who owns your patch, because your handoff quality is measured by their renewal rate. Read the "SE Playbook" in Confluence before your first external call. Week 1: complete the internal product certification.`,
    7: `Week 1 done! A few things that surfaced this week:\n\nTop customer friction: integration complexity with legacy CRMs — you'll hear this on ~60% of calls, prepare a sharp answer. Three deals in your patch: DataFlow (POC kicking off Monday), Starfield (at-risk, champion left), NovaTech (upsell discussion Thursday). The handoff template in Confluence is the source of truth — CS will hold you to it. Week 2: sit in on a renewal QBR to understand what a successful handoff looks like downstream.`,
    14: `Two weeks in! DataFlow POC is going well — they're asking about API rate limits. Pull the technical spec from Confluence and loop in Engineering for their deep-dive. Starfield update: new champion identified, re-engagement call set for next week. One pattern to internalize: our fastest-closing deals all had a documented success criteria doc signed before POC kickoff. Make that your standard operating procedure from day 1 of every POC.`,
    30: `One month down — solid work. You've run 3 demos, 1 POC, and closed your first technical win. The team's win/loss ratio is 68% when SEs are in from first call vs. 41% when brought in late. DataFlow POC converted to a contract. NovaTech pushed to next quarter. Focus for month 2: build your champion playbook and refine discovery questions based on your Gong reviews.`,
    45: `Six weeks in — POC framework review:\n\nYour last 3 POCs all had signed scope docs before kickoff — that's the bar and you're hitting it. Two things to sharpen: (1) Your Gong scores show discovery questions front-loaded in calls; the strongest SEs spread them across the full conversation to build trust progressively. (2) DataFlow's renewal is coming up — loop in CS now to make sure the handoff notes are complete. Your manager flagged NovaTech as needing a re-engagement plan by Friday.`,
    60: `Two months in — you're fully ramped:\n\nYou've contributed to 7 deals, 2 technical wins, and your avg POC-to-close is 23 days (team avg: 31). Area to sharpen: executive-level ROI conversations — bring your manager to the next C-suite meeting as a model. Your patch has 4 active deals. Highest priority: Meridian renewal at risk. Get a technical differentiation session on the calendar this week.`,
    90: `Ramp complete. Full 90-day picture:\n\nStrong ramp: 12 deals touched, 4 technical wins, 1 expansion influenced. You built the DataFlow relationship into a reference customer. Next 90 days: take ownership of a full territory, develop a repeatable POC framework, and start contributing to the SE playbook. Your QBR is next Thursday — come with your pipeline scorecard and 3 asks.`,
  },
  'Implementation Engineer': {
    1: `Welcome! As an IE you own the post-sale technical relationship. Day 1 priorities:\n\nGet Jira access (3 implementation kick-offs already assigned — check your email). The #cs-team channel gives you context on each customer's history and frustrations. Our implementation methodology is in Confluence under "IE Playbook" — read it before your first customer call. Key relationship: the AE who closed the deal, because their discovery notes are your north star for understanding customer goals. Week 1: shadow two kick-off calls with a senior IE.`,
    7: `Week 1 done! From #cs-team this week:\n\nTwo themes: (1) Data migration timelines are being underestimated — build in a 2-week buffer by default. (2) Customers want weekly status emails; our template is in Confluence (ask Jordan for the updated version). Your three implementations: BrightPath (Day 14 of 90, on track), CoreSystems (Day 3 of 90, kick-off good), Meridian (Day 45 of 90, hitting data mapping issues — flag to your manager). Week 2: take ownership of your first customer status call solo.`,
    14: `Two weeks in! Updates:\n\nMeridian data mapping issue resolved — Engineering shipped a fix Friday, test in staging before applying to prod. BrightPath on track for go-live in 4 weeks. CoreSystems has a complex SSO setup — loop in Security this week. A pattern to flag early: if CoreSystems doesn't have a dedicated customer project manager, surface it now. Lack of a customer PM predicts delays 80% of the time. Month-1 milestone: own a go-live end-to-end with senior IE shadowing.`,
    30: `One month done! Great progress:\n\nBrightPath go-live completed — they went live 2 days ahead of schedule. CoreSystems SSO resolved after 3 sessions with their IT team. Meridian is back on track after the data mapping fix. Your CSAT so far: 4.8/5.0. Focus for month 2: start leading CoreSystems independently and document your learnings in the IE shared playbook. Strong first month.`,
    45: `Six weeks in! Mid-ramp check:\n\nYou've completed 1 go-live, have 2 in-flight, and your implementation health scores are all green. The team noticed your detailed status emails to Meridian — that's the standard we want. One thing to refine: technical scope documentation at kick-off. Your Meridian scope expanded twice; earlier written agreement prevents this. Ask your manager for the scope change template.`,
    60: `Two months in — you're hitting your stride:\n\nPortfolio: 2 go-lives completed, 1 in-flight, 1 kick-off this week. Your avg time-to-go-live is 38 days vs team avg of 47. CoreSystems went live last week — they've already referred another prospect. Key focus: the new kick-off (Axiom) has a 60-day hard deadline driven by a contract term. Get the full scope documented in week 1.`,
    90: `Ramp complete — 90 days in:\n\nYou've completed 3 go-lives with an avg CSAT of 4.9/5.0, 2 reference customers created, and 0 escalations. The team avg at 90 days is 2 go-lives — you exceeded it. Next 90 days: shadow a QBR, take on 2 simultaneous large implementations, and start writing implementation playbook articles. Exceptional ramp.`,
  },
};

// ---------------------------------------------------------------------------
// Access request contacts by role
// ---------------------------------------------------------------------------

const ACCESS_BY_ROLE: Record<string, Array<{ tool: string; from_name: string; from_email: string; from_slack: string | null }>> = {
  'AI Solutions Architect': [
    { tool: 'Salesforce', from_name: 'Jordan Kim', from_email: 'jordan@demo.usecanon.com', from_slack: 'U0CONTACT01' },
    { tool: 'Gong', from_name: 'Jordan Kim', from_email: 'jordan@demo.usecanon.com', from_slack: 'U0CONTACT01' },
    { tool: 'Outreach', from_name: 'Alex Torres', from_email: 'alex.t@demo.usecanon.com', from_slack: 'U0CONTACT02' },
    { tool: 'Zoom', from_name: 'IT Help Desk', from_email: 'it@demo.usecanon.com', from_slack: 'U0CONTACT03' },
  ],
  'Solutions Engineer': [
    { tool: 'Salesforce', from_name: 'Jordan Kim', from_email: 'jordan@demo.usecanon.com', from_slack: 'U0CONTACT01' },
    { tool: 'Gong', from_name: 'Jordan Kim', from_email: 'jordan@demo.usecanon.com', from_slack: 'U0CONTACT01' },
    { tool: 'GitHub', from_name: 'DevOps Team', from_email: 'devops@demo.usecanon.com', from_slack: 'U0CONTACT04' },
    { tool: 'Confluence', from_name: 'Alex Torres', from_email: 'alex.t@demo.usecanon.com', from_slack: 'U0CONTACT02' },
    { tool: 'Zoom', from_name: 'IT Help Desk', from_email: 'it@demo.usecanon.com', from_slack: 'U0CONTACT03' },
  ],
  'Implementation Engineer': [
    { tool: 'Salesforce', from_name: 'Jordan Kim', from_email: 'jordan@demo.usecanon.com', from_slack: 'U0CONTACT01' },
    { tool: 'Jira', from_name: 'DevOps Team', from_email: 'devops@demo.usecanon.com', from_slack: 'U0CONTACT04' },
    { tool: 'Confluence', from_name: 'Alex Torres', from_email: 'alex.t@demo.usecanon.com', from_slack: 'U0CONTACT02' },
    { tool: 'GitHub', from_name: 'DevOps Team', from_email: 'devops@demo.usecanon.com', from_slack: 'U0CONTACT04' },
    { tool: 'Zoom', from_name: 'IT Help Desk', from_email: 'it@demo.usecanon.com', from_slack: 'U0CONTACT03' },
  ],
};

// Determine access request status per tool index based on ramp day
// Shows all four statuses across the demo set:
//   pending → sent → acknowledged → granted
function accessStatus(rampDay: number, toolIndex: number, totalTools: number): { status: string; sent_at: string | null } {
  if (rampDay <= 1) {
    // Day 1 — everything pending, DMs not yet sent
    return { status: 'pending', sent_at: null };
  }
  if (rampDay <= 7) {
    // Day 7 — first tool request sent, rest pending
    return toolIndex === 0
      ? { status: 'sent', sent_at: daysAgoIso(rampDay - 1) }
      : { status: 'pending', sent_at: null };
  }
  if (rampDay <= 14) {
    // Day 14 — first granted, one sent, rest pending
    if (toolIndex === 0) return { status: 'granted', sent_at: daysAgoIso(rampDay - 1) };
    if (toolIndex === 1) return { status: 'sent', sent_at: daysAgoIso(rampDay - 2) };
    return { status: 'pending', sent_at: null };
  }
  if (rampDay <= 30) {
    // Day 30 — show all four statuses
    if (toolIndex === 0) return { status: 'granted', sent_at: daysAgoIso(rampDay - 2) };
    if (toolIndex === 1) return { status: 'granted', sent_at: daysAgoIso(rampDay - 3) };
    if (toolIndex === 2) return { status: 'acknowledged', sent_at: daysAgoIso(rampDay - 5) };
    if (toolIndex === totalTools - 1) return { status: 'sent', sent_at: daysAgoIso(rampDay - 10) };
    return { status: 'pending', sent_at: null };
  }
  if (rampDay <= 60) {
    // Day 45–60 — most granted, one still sent (stalled — shows on dashboard)
    if (toolIndex < totalTools - 1) return { status: 'granted', sent_at: daysAgoIso(rampDay - 5) };
    return { status: 'sent', sent_at: daysAgoIso(rampDay - 20) }; // stalled >48h
  }
  // Day 90 completed — all granted
  return { status: 'granted', sent_at: daysAgoIso(rampDay - 10) };
}

// ---------------------------------------------------------------------------
// Global milestone definitions — mirrors seed.sql so the seed route is
// self-contained and works even if `supabase db reset` was never run.
// ---------------------------------------------------------------------------

const GLOBAL_MILESTONES = [
  // AI Solutions Architect
  { organization_id: null, role: 'AI Solutions Architect', day_trigger: 1, title: 'Welcome + tools and access overview', description: 'Everything you need to know on day one: who to talk to, what tools you need, and what your first week looks like.', knowledge_query: 'onboarding welcome tools access permissions getting started first day' },
  { organization_id: null, role: 'AI Solutions Architect', day_trigger: 7, title: 'Product deep dive', description: 'How the product works, how customers use it, and what makes it different from competitors.', knowledge_query: 'product features use cases customer stories differentiation technical architecture' },
  { organization_id: null, role: 'AI Solutions Architect', day_trigger: 14, title: 'First customer call prep', description: 'Discovery frameworks, common objections, demo scripts, and how to run a great first call.', knowledge_query: 'discovery questions objection handling demo scripts customer call preparation' },
  { organization_id: null, role: 'AI Solutions Architect', day_trigger: 30, title: '30-day check-in brief', description: 'Process, team dynamics, internal tools, and how to be a great cross-functional partner.', knowledge_query: 'team processes internal workflows cross-functional collaboration feedback loops' },
  { organization_id: null, role: 'AI Solutions Architect', day_trigger: 60, title: 'Ramping to full contribution', description: 'Pipeline management, forecasting, and what separates good from great in this role.', knowledge_query: 'pipeline management quota attainment forecasting deal strategy advanced selling' },
  { organization_id: null, role: 'AI Solutions Architect', day_trigger: 90, title: 'Full productivity benchmark', description: 'Competitive landscape, strategic account patterns, and how to build long-term customer relationships.', knowledge_query: 'competitive landscape strategic accounts customer success expansion advanced product knowledge' },
  // Solutions Engineer
  { organization_id: null, role: 'Solutions Engineer', day_trigger: 1, title: 'Welcome + tools and access overview', description: 'Day one essentials: tools, access, team structure, and what your first week looks like.', knowledge_query: 'onboarding welcome tools access permissions getting started first day' },
  { organization_id: null, role: 'Solutions Engineer', day_trigger: 7, title: 'Technical product deep dive', description: 'Architecture, integrations, APIs, and how customers plug the product into their stack.', knowledge_query: 'technical architecture API integrations implementation patterns customer stack' },
  { organization_id: null, role: 'Solutions Engineer', day_trigger: 14, title: 'Demo and POC prep', description: 'How to run a great demo, how to scope and run a proof of concept, common technical objections.', knowledge_query: 'demo preparation proof of concept technical objections scoping evaluation criteria' },
  { organization_id: null, role: 'Solutions Engineer', day_trigger: 30, title: 'Technical discovery mastery', description: 'How to run great technical discovery, map customer requirements, and build winning proposals.', knowledge_query: 'technical discovery requirements mapping solution design proposal writing' },
  { organization_id: null, role: 'Solutions Engineer', day_trigger: 60, title: 'Advanced implementation patterns', description: 'Complex integrations, edge cases, escalation paths, and how to engage engineering effectively.', knowledge_query: 'complex integrations escalation engineering collaboration implementation edge cases' },
  { organization_id: null, role: 'Solutions Engineer', day_trigger: 90, title: 'Full technical authority', description: 'Strategic technical advisory, RFP responses, and how to be the technical authority in a deal.', knowledge_query: 'technical advisory RFP response strategic deals competitive technical win' },
  // Implementation Engineer
  { organization_id: null, role: 'Implementation Engineer', day_trigger: 1, title: 'Welcome + tools and access overview', description: 'Day one essentials: tools, access, team structure, and what your first week looks like.', knowledge_query: 'onboarding welcome tools access permissions getting started first day' },
  { organization_id: null, role: 'Implementation Engineer', day_trigger: 7, title: 'Implementation methodology', description: 'How implementations are structured, what good looks like, and common failure modes to avoid.', knowledge_query: 'implementation methodology project structure success criteria failure modes best practices' },
  { organization_id: null, role: 'Implementation Engineer', day_trigger: 14, title: 'First customer project prep', description: 'Kickoff frameworks, stakeholder management, timeline planning, and how to handle scope creep.', knowledge_query: 'project kickoff stakeholder management timeline planning scope creep change management' },
  { organization_id: null, role: 'Implementation Engineer', day_trigger: 30, title: 'Technical delivery excellence', description: 'Data migration, integration patterns, and how to get customers to production fast.', knowledge_query: 'data migration integration delivery production deployment customer go-live' },
  { organization_id: null, role: 'Implementation Engineer', day_trigger: 60, title: 'Complex project management', description: 'Multi-workstream projects, executive stakeholders, and how to manage at-risk implementations.', knowledge_query: 'complex projects executive stakeholders at-risk recovery escalation multi-workstream' },
  { organization_id: null, role: 'Implementation Engineer', day_trigger: 90, title: 'Strategic implementation advisory', description: 'How to run strategic accounts, build playbooks, and contribute to the implementation methodology.', knowledge_query: 'strategic accounts playbook development methodology contribution implementation leadership' },
];

// ---------------------------------------------------------------------------
// Custom org-specific milestones (shows the customization feature)
// ---------------------------------------------------------------------------

const CUSTOM_MILESTONES = [
  {
    role: 'AI Solutions Architect' as const,
    day_trigger: 45,
    title: 'First Independent Deal Cycle',
    description: 'You should now be running a full deal cycle — discovery, demo, POC, and close — without needing to shadow. Review your pipeline in Salesforce and confirm you have at least one deal in each stage.',
    knowledge_query: 'deal cycle close independent discovery demo POC',
  },
  {
    role: 'Solutions Engineer' as const,
    day_trigger: 45,
    title: 'POC Framework Mastery',
    description: 'By Day 45 you should have your POC playbook locked down. Review the success criteria template with your manager and make sure your last 3 POCs all had signed scope docs before kickoff.',
    knowledge_query: 'POC playbook success criteria scope technical win',
  },
  {
    role: 'Implementation Engineer' as const,
    day_trigger: 45,
    title: 'First Solo Go-Live',
    description: 'Milestone: your first go-live where you are the sole IE without senior shadow. Your manager has signed off on your readiness. Document any gaps in the shared playbook for the next IE.',
    knowledge_query: 'go-live implementation solo milestone CSAT customer success',
  },
];

const DEMO_READINESS_ITEMS = [
  {
    category: 'product_change' as const,
    title: 'Product API limits changed',
    summary: 'API rate limit behavior changed for enterprise workspaces.',
    recommended_action: 'send readiness note to AI SAs and update Day 14 milestone.',
    impact_level: 'high' as const,
    affected_roles: ['AI Solutions Architect', 'Solutions Engineer'],
    source_url: 'demo://readiness/product-api-limits',
    source_metadata: { demo: true, signals_reviewed: 6, stale_knowledge_areas: 1, milestones_covered_percent: 82 },
    status: 'reviewed' as const,
  },
  {
    category: 'customer_objection' as const,
    title: 'Workspace permissions confusion',
    summary: 'Three Slack threads mention confusion around workspace permissions.',
    recommended_action: 'Send a readiness note to AI SAs with the updated workspace permissions talk track.',
    impact_level: 'high' as const,
    affected_roles: ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'],
    source_url: 'demo://readiness/workspace-permissions',
    source_metadata: { demo: true, signals_reviewed: 3, stale_knowledge_areas: 1 },
    status: 'draft' as const,
  },
  {
    category: 'demo_guidance' as const,
    title: 'Customer-owned LLM routing objection',
    summary: 'New objection pattern detected around customer-owned LLM routing.',
    recommended_action: 'Refresh demo guidance with the approved customer-owned LLM routing response.',
    impact_level: 'medium' as const,
    affected_roles: ['AI Solutions Architect', 'Solutions Engineer'],
    source_url: 'demo://readiness/customer-owned-llm-routing',
    source_metadata: { demo: true, signals_reviewed: 5, stale_knowledge_areas: 1 },
    status: 'reviewed' as const,
  },
  {
    category: 'implementation_pattern' as const,
    title: 'Day 14 call prep needs a permissions checkpoint',
    summary: 'Recent implementation threads show workspace permission assumptions are delaying handoffs.',
    recommended_action: 'Add a Day 14 milestone checkpoint for workspace permission ownership before customer prep calls.',
    impact_level: 'low' as const,
    affected_roles: ['Implementation Engineer'],
    source_url: 'demo://readiness/day-14-permissions-checkpoint',
    source_metadata: { demo: true, signals_reviewed: 5, stale_knowledge_areas: 1 },
    status: 'draft' as const,
  },
];

async function seedDemoReadinessItems(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string) {
  await supabase
    .from('readiness_items')
    .delete()
    .eq('organization_id', organizationId)
    .like('source_url', 'demo://readiness/%');

  await supabase.from('readiness_items').insert(
    DEMO_READINESS_ITEMS.map((item) => ({
      organization_id: organizationId,
      source: 'slack',
      ...item,
      updated_at: new Date().toISOString(),
    }))
  );
}

// ---------------------------------------------------------------------------
// Seed handler
// ---------------------------------------------------------------------------

export async function GET() {
  const { session } = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const { data: org } = await supabase.from('organizations').select('id').single();
  if (!org) return NextResponse.json({ seeded: false });

  const { data: demoHires } = await supabase
    .from('new_hires')
    .select('id')
    .eq('organization_id', org.id)
    .like('email', '%@demo.usecanon.com')
    .limit(1);

  const { data: demoReadinessItems } = await supabase
    .from('readiness_items')
    .select('id')
    .eq('organization_id', org.id)
    .like('source_url', 'demo://readiness/%')
    .limit(1);

  return NextResponse.json({
    seeded: (demoHires?.length ?? 0) > 0 || (demoReadinessItems?.length ?? 0) > 0,
  });
}

export async function POST() {
  const { session } = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const userId = session.user.id;

  // Get or create org
  let orgId: string;
  const { data: existingOrg } = await supabase.from('organizations').select('id').single();
  if (existingOrg) {
    orgId = existingOrg.id;
  } else {
    const { data: newOrg, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: 'Acme Corp', slug: `acme-${userId.slice(0, 8)}`, owner_id: userId })
      .select('id')
      .single();
    if (orgError || !newOrg) {
      return NextResponse.json({ error: `Failed to create org: ${orgError?.message}` }, { status: 500 });
    }
    orgId = newOrg.id;
  }

  // Idempotency check
  const { data: existing } = await supabase
    .from('new_hires')
    .select('id')
    .eq('organization_id', orgId)
    .like('email', '%@demo.usecanon.com');
  if (existing && existing.length > 0) {
    await seedDemoReadinessItems(supabase, orgId);
    return NextResponse.json({ message: 'Demo data already loaded', already_seeded: true });
  }

  // Knowledge sources
  const { error: ksError } = await supabase.from('knowledge_sources').insert(
    DEMO_KNOWLEDGE_SOURCES.map((s) => ({ ...s, organization_id: orgId }))
  );
  if (ksError) {
    return NextResponse.json({ error: `Knowledge sources failed: ${ksError.message}` }, { status: 500 });
  }

  // Org-specific milestones (shows the customization feature)
  await supabase.from('ramp_milestones').insert(
    CUSTOM_MILESTONES.map((m) => ({ ...m, organization_id: orgId }))
  );

  await seedDemoReadinessItems(supabase, orgId);

  // Fetch global milestones (organization_id IS NULL) — if seed.sql was never run,
  // create them now via service role (RLS blocks null-org inserts from regular users).
  let { data: globalMilestones } = await supabase
    .from('ramp_milestones')
    .select('id, role, day_trigger')
    .is('organization_id', null);

  if (!globalMilestones || globalMilestones.length === 0) {
    const serviceSupabase = createServiceRoleClient();
    const { data: inserted } = await serviceSupabase.from('ramp_milestones').insert(GLOBAL_MILESTONES).select('id, role, day_trigger');
    globalMilestones = inserted ?? [];
  }

  // Also include the org-specific milestones we just inserted (e.g., the Day 45 custom ones)
  const { data: orgMilestones } = await supabase
    .from('ramp_milestones')
    .select('id, role, day_trigger')
    .eq('organization_id', orgId);

  // Build map from both sets; org-specific overwrites global at same role+day
  const milestoneMap: Record<string, Record<number, string>> = {};
  for (const m of [...(globalMilestones ?? []), ...(orgMilestones ?? [])]) {
    if (!milestoneMap[m.role]) milestoneMap[m.role] = {};
    milestoneMap[m.role][m.day_trigger] = m.id as string;
  }

  let totalDeliveries = 0;
  let totalAccessRequests = 0;

  for (const hire of DEMO_HIRES) {
    const { data: newHire, error: hireError } = await supabase
      .from('new_hires')
      .insert({
        organization_id: orgId,
        created_by: userId,
        name: hire.name,
        email: hire.email,
        role: hire.role,
        start_date: hire.start_date,
        ramp_day: hire.ramp_day,
        slack_user_id: hire.slack_user_id,
        status: hire.status,
      })
      .select('id')
      .single();

    if (hireError || !newHire) continue;
    const hireId = newHire.id as string;

    // Deliveries — insert for every milestone day the hire has reached (dynamic from map)
    const hireDays = Object.keys(milestoneMap[hire.role] ?? {})
      .map(Number)
      .sort((a, b) => a - b)
      .filter((d) => hire.ramp_day >= d);

    const deliveries: object[] = [];
    for (const day of hireDays) {

      const milestoneId = milestoneMap[hire.role]?.[day];
      if (!milestoneId) continue;

      const content = DELIVERY_CONTENT[hire.role]?.[day];
      const deliveredAt = daysAgoIso(hire.ramp_day - day);

      // Marcus (Day 30, no Slack ID) — make his Day 30 delivery a failure to show that state
      const isFailed = hire.name === 'Marcus Johnson' && day === 30;

      deliveries.push({
        new_hire_id: hireId,
        milestone_id: milestoneId,
        delivery_status: isFailed ? 'failed' : 'delivered',
        delivery_channel: 'slack',
        content_delivered: isFailed ? null : (content ?? `Day ${day} milestone delivered for ${hire.name}.`),
        delivered_at: isFailed ? null : deliveredAt,
        error_message: isFailed
          ? 'Slack API error: user_not_found — no Slack user ID is configured for this hire. Add their Slack member ID on the hire profile to enable DMs.'
          : null,
        slack_ts: isFailed ? null : `${(Date.now() / 1000 - (hire.ramp_day - day) * 86400).toFixed(6)}`,
      });
    }

    if (deliveries.length > 0) {
      await supabase.from('ramp_deliveries').insert(deliveries);
      totalDeliveries += deliveries.length;
    }

    // Access requests — all four status types represented across the demo set
    const tools = ACCESS_BY_ROLE[hire.role] ?? [];
    const accessRequests = tools.map((tool, i) => {
      const { status, sent_at } = accessStatus(hire.ramp_day, i, tools.length);
      return {
        new_hire_id: hireId,
        tool_name: tool.tool,
        requested_from_name: tool.from_name,
        requested_from_email: tool.from_email,
        requested_from_slack_id: tool.from_slack,
        status,
        sent_at,
      };
    });

    await supabase.from('access_requests').insert(accessRequests);
    totalAccessRequests += accessRequests.length;
  }

  return NextResponse.json({
    message: 'Demo data seeded successfully',
    hires: DEMO_HIRES.length,
    knowledge_sources: DEMO_KNOWLEDGE_SOURCES.length,
    custom_milestones: CUSTOM_MILESTONES.length,
    readiness_items: DEMO_READINESS_ITEMS.length,
    deliveries: totalDeliveries,
    access_requests: totalAccessRequests,
  });
}

// Clear demo data (keeps org and global milestones intact)
export async function DELETE() {
  const { session } = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const { data: org } = await supabase.from('organizations').select('id').single();
  if (!org) return NextResponse.json({ message: 'Nothing to clear' });

  await supabase
    .from('new_hires')
    .delete()
    .eq('organization_id', org.id)
    .like('email', '%@demo.usecanon.com');

  await supabase
    .from('knowledge_sources')
    .delete()
    .eq('organization_id', org.id)
    .like('slack_channel_id', 'C0DEMO%');

  await supabase
    .from('ramp_milestones')
    .delete()
    .eq('organization_id', org.id);

  await supabase
    .from('readiness_items')
    .delete()
    .eq('organization_id', org.id)
    .like('source_url', 'demo://readiness/%');

  return NextResponse.json({ message: 'Demo data cleared' });
}
