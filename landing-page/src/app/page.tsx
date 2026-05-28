import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

import { AnimateIn } from '@/components/AnimateIn';
import { FaqAccordion } from '@/components/landing-page/FaqAccordion';
import { ProductTour } from '@/components/landing-page/ProductTour';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';

const requestAccessHref = 'https://app.usecanon.com';

export const metadata: Metadata = {
  title: 'Canon | Technical GTM Onboarding & Readiness',
  description:
    'Canon reduces time to productivity for Technical GTM hires and keeps your whole team field-ready as your product and market evolve.',
  openGraph: {
    title: 'Canon | Technical GTM Onboarding & Readiness',
    description:
      'Canon reduces time to productivity for Technical GTM hires and keeps your whole team field-ready as your product and market evolve.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Canon | Technical GTM Onboarding & Readiness',
    description:
      'Canon reduces time to productivity for Technical GTM hires and keeps your whole team field-ready as your product and market evolve.',
  },
};

// ── Data ──────────────────────────────────────────────────────────────────────

const statusCards = [
  {
    eyebrow: 'Hire Progress',
    title: 'Jordan hit 3 of 5 milestones in week two',
    detail: 'Discovery & Qualification and Competitive Positioning complete. Next: Technical Demo Certification.',
    value: '3/5',
    tone: 'emerald',
  },
  {
    eyebrow: 'Readiness Gap',
    title: 'Pricing update: 5 reps on active deals not current',
    detail: "Confluence changes detected across 3 docs. Five reps with open opportunities haven't reviewed the new packaging.",
    value: '5 gaps',
    tone: 'amber',
  },
  {
    eyebrow: 'Knowledge Sync',
    title: 'Gong analysis synced to onboarding briefs',
    detail: 'Top-performer call patterns and two new objection responses added. All open briefs updated automatically.',
    value: 'Synced',
    tone: 'purple',
  },
] as const;

const rampLoop = [
  { step: '01', title: 'Connect knowledge', body: 'Link Confluence, Gong, Slack, GitHub, and more. Canon keeps context current as sources update so briefs never go stale.' },
  { step: '02', title: 'Define milestones', body: 'Set role-specific capability checkpoints. Every hire gets a structured path from day one, not a generic onboarding deck.' },
  { step: '03', title: 'Launch the hire path', body: 'Add a new hire and Canon generates their brief, assigns milestones, and creates their access request list automatically.' },
  { step: '04', title: 'Monitor readiness', body: 'When product or market changes create gaps, Canon surfaces who is affected, for new hires and the broader team alike.' },
];

const productTourLayers = [
  {
    stage: 'Home',
    title: 'See ramp status and readiness in one place.',
    description:
      'The home view gives managers a concise operating surface for hire progress, team readiness, and the work Canon is doing behind the scenes.',
    image: '/home.png',
    alt: 'Canon home dashboard showing onboarding and readiness status.',
    highlights: ['Team overview', 'Live status', 'Manager cockpit'],
  },
  {
    stage: 'New hire',
    title: 'Launch a role-specific path before day one.',
    description:
      'Add a hire, choose the role context, and Canon prepares the onboarding path from your connected knowledge sources instead of starting from a blank plan.',
    image: '/new_hire.png',
    alt: 'Canon new hire setup screen for creating an onboarding path.',
    highlights: ['Role context', 'Path setup', 'Day-one ready'],
  },
  {
    stage: 'Milestones',
    title: 'Track outcomes, not just completed tasks.',
    description:
      'Milestones make readiness visible through capability checkpoints that managers and new hires can both use to understand what is complete and what comes next.',
    image: '/milestones.png',
    alt: 'Canon milestones screen showing onboarding checkpoint progress.',
    highlights: ['Capabilities', 'Progress clarity', 'Shared expectations'],
  },
  {
    stage: 'Knowledge',
    title: 'Ground every brief in current source material.',
    description:
      'Canon pulls from connected product docs, call intelligence, and internal knowledge so onboarding stays tied to what your team actually knows today.',
    image: '/knowledge.png',
    alt: 'Canon knowledge screen showing connected source material.',
    highlights: ['Connected sources', 'Brief generation', 'Fresh context'],
  },
  {
    stage: 'Readiness',
    title: 'Catch field gaps as the business changes.',
    description:
      'When product, pricing, or positioning changes, Canon surfaces who is affected so readiness work can happen before stale information reaches a customer conversation.',
    image: '/readiness.png',
    alt: 'Canon readiness screen showing field readiness gaps and updates.',
    highlights: ['Gap detection', 'Change monitoring', 'Field alerts'],
  },
] as const;

const statsData = [
  {
    stat: '9–12 mo',
    gradient: 'text-gradient-purple',
    label: 'Average ramp time',
    body: "Industry average for an enterprise Technical GTM hire to reach full productivity. Most teams treat this as a fixed cost. It isn't.",
    source: 'Bridge Group, GTM benchmark consensus',
    sourceUrl: 'https://salesso.com/blog/sales-ramp-up-statistics-2025-benchmarks-best-practices/',
    accent: 'var(--canon-purple)',
  },
  {
    stat: '78%',
    gradient: 'text-gradient-amber',
    label: 'Missed quota in 2025',
    body: 'Sellers who fell short last year, up from 69% in 2024. Poor ramp and stale field readiness are among the leading contributors.',
    source: 'Ebsta x Pavilion, 2025 GTM Benchmarks',
    sourceUrl: 'https://benchmarks.ebsta.com/2025-gtm-benchmarks',
    accent: 'var(--amber)',
  },
  {
    stat: 'Day 1',
    gradient: 'text-gradient-green',
    label: 'When Canon starts',
    body: 'Briefs are live before the hire walks in. And they keep updating as your product and market change.',
    source: null,
    sourceUrl: null,
    accent: 'var(--green)',
  },
];

const features = [
  {
    kicker: 'Onboarding',
    title: 'Knowledge-grounded from day one.',
    body: 'Every brief draws from live sources (Confluence, Gong, Slack, GitHub), so the hire is working with current context, not a snapshot from last quarter.',
    accent: 'var(--canon-purple)',
    accentClass: 'bg-[var(--canon-purple)]',
  },
  {
    kicker: 'Progress',
    title: 'Milestones that mean something.',
    body: 'Role-specific capability checkpoints give hire and manager a clear, shared view of progress, not just activity. You always know who is ready for what.',
    accent: 'var(--green)',
    accentClass: 'bg-[var(--green)]',
  },
  {
    kicker: 'Readiness',
    title: 'Current after the first week, too.',
    body: 'Canon detects product and market changes and surfaces who is affected, for new hires still ramping and for the broader team already in the field.',
    accent: 'var(--amber)',
    accentClass: 'bg-[var(--amber)]',
  },
];

const integrations = [
  { icon: <IntegrationLogos provider="confluence" size={22} />, name: 'Confluence', body: 'Sync product docs, messaging guides, and playbooks as live knowledge sources.' },
  { icon: <IntegrationLogos provider="gong" size={22} />, name: 'Gong', body: 'Pull top-performer call patterns and objection responses into onboarding briefs.' },
  { icon: <IntegrationLogos provider="slack" size={22} />, name: 'Slack', body: 'Deliver onboarding updates and readiness alerts where your team already works.' },
  { icon: <IntegrationLogos provider="github" size={22} />, name: 'GitHub', body: 'Connect technical docs and changelogs so product updates flow into field readiness.' },
];

const faqItems = [
  { question: 'What does Canon actually do?', answer: 'Canon builds personalized onboarding paths for Technical GTM hires, drawing from your live knowledge sources, and then monitors for product and market changes that could create readiness gaps after onboarding ends. The result is shorter time to productivity and a field team that stays current without manual enablement work.' },
  { question: 'Who is Canon built for?', answer: 'Canon is built for Technical GTM teams: Solutions Engineers, Sales Engineers, Technical Account Managers, and the managers and enablement leaders who ramp and support them.' },
  { question: 'How does readiness work after onboarding ends?', answer: 'Canon continues to watch your connected knowledge sources. When it detects a meaningful change (a new pricing model in Confluence, a product update in GitHub, a shift in competitive positioning), it surfaces who is affected and updates the relevant briefs so leaders can act before gaps reach the field.' },
  { question: 'What knowledge sources does Canon connect to?', answer: 'Canon currently connects to Confluence, Gong, Slack, and GitHub. Additional sources are in progress. If your stack is not listed, reach out at john@usecanon.com and we will let you know what is coming.' },
  { question: 'How long does setup take?', answer: 'Most teams are connected, milestones defined, and the first hire launched within a single session. No custom implementation or dedicated IT project required.' },
  { question: 'Is my data secure?', answer: 'Yes. Canon uses OAuth for all integrations, encrypts tokens at rest, and only reads from explicitly connected sources. Canon never writes to your tools.' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

type StatusTone = (typeof statusCards)[number]['tone'];

function toneStyles(tone: StatusTone) {
  if (tone === 'amber') return { shell: { border: '1px solid var(--amber-border)', backgroundColor: 'var(--amber-bg)' }, eyebrow: { color: 'var(--amber-text)' }, value: { color: 'var(--amber-text)' } };
  if (tone === 'purple') return { shell: { border: '1px solid var(--canon-purple-border)', backgroundColor: 'var(--canon-purple-light)' }, eyebrow: { color: 'var(--canon-purple)' }, value: { color: 'var(--canon-purple)' } };
  return { shell: { border: '1px solid var(--green-border)', backgroundColor: 'var(--green-bg)' }, eyebrow: { color: 'var(--green-text)' }, value: { color: 'var(--green-text)' } };
}

const inner = 'mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="relative min-h-screen" style={{ color: 'var(--text-primary)' }}>
      <Navigation />

      <main>

        {/* ═══════════════════════════════════════════════════════════
            HERO
            ─ Centered layout, dot-grid + purple ambient glow bg
            ─ Staggered CSS animations on load (no IntersectionObserver
              needed — these are above the fold)
        ═══════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden text-center">
          {/* Dot-grid + glow layers */}
          <div className="hero-dot-grid pointer-events-none absolute inset-0" />
          <div className="hero-glow pointer-events-none absolute inset-0" />

          <div className={`${inner} relative pt-20 pb-10 lg:pt-28 lg:pb-12`}>

            {/* Badge */}
            <div style={{ animation: 'fade-up 0.55s ease 0.05s both' }}>
              <span className="badge-hero">
                <span className="live-dot relative inline-block h-1.5 w-1.5 rounded-full bg-[var(--canon-purple)]" />
                Technical GTM Onboarding &amp; Field Readiness Platform
              </span>
            </div>

            {/* H1 */}
            <h1
              className="type-landing-hero mx-auto mt-6 max-w-3xl"
              style={{
                color: 'var(--text-primary)',
                animation: 'fade-up 0.6s ease 0.15s both',
              }}
            >
              Ramp Technical GTM faster.<br />
              <span className="text-gradient-purple">Stay ready.</span>
            </h1>

            {/* Subheadline */}
            <p
              className="mx-auto mt-6 max-w-xl text-base leading-7"
              style={{ color: 'var(--text-secondary)', animation: 'fade-up 0.6s ease 0.25s both' }}
            >
              Canon is the onboarding platform that reduces time to productivity for Technical GTM hires
              and keeps your field team current as your product and market evolve.
            </p>

            {/* CTAs */}
            <div
              className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
              style={{ animation: 'fade-up 0.6s ease 0.35s both' }}
            >
              <Button size="lg" className="btn-primary-shimmer" asChild>
                <a href={requestAccessHref} target="_blank" rel="noopener noreferrer">
                  Get Access
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <a href="#product-tour">See the product</a>
              </Button>
            </div>

            {/* Works-with strip */}
            <div
              className="mt-8 flex items-center justify-center gap-2 flex-wrap"
              style={{ animation: 'fade-up 0.6s ease 0.45s both' }}
            >
              <span className="type-kicker mr-2">Works with</span>
              {[
                { label: 'Confluence', icon: <IntegrationLogos provider="confluence" size={14} /> },
                { label: 'Gong', icon: <IntegrationLogos provider="gong" size={14} /> },
                { label: 'Slack', icon: <IntegrationLogos provider="slack" size={14} className="text-[var(--text-tertiary)]" /> },
                { label: 'GitHub', icon: <IntegrationLogos provider="github" size={14} className="text-[var(--text-tertiary)]" /> },
              ].map((item) => (
                <span
                  key={item.label}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]"
                  style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'rgba(255,255,255,0.03)', color: 'var(--text-tertiary)' }}
                >
                  {item.icon}
                  {item.label}
                </span>
              ))}
              <span className="text-xs ml-1" style={{ color: 'var(--text-tertiary)' }}>+ more</span>
            </div>
          </div>

          {/* ── Product preview panel ── */}
          <div
            className={`${inner} pb-24 lg:pb-32`}
            style={{ animation: 'fade-up 0.7s ease 0.55s both' }}
          >
            <div
              className="preview-panel card-hover mt-4 w-full overflow-hidden rounded-[14px] border text-left"
              style={{
                borderColor: 'var(--border-secondary)',
                boxShadow: '0 0 0 1px rgba(107,92,231,0.08), 0 32px 80px rgba(0,0,0,0.55)',
              }}
            >
              {/* Window chrome */}
              <div
                className="flex items-center gap-3 border-b px-5 py-3"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-tertiary)' }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--border-secondary)' }} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--border-secondary)' }} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--border-secondary)' }} />
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {/* Pulsing live dot */}
                  <span className="relative flex h-2 w-2">
                    <span className="live-dot-ring live-dot absolute inline-flex h-full w-full rounded-full" style={{ color: 'var(--green-text)', backgroundColor: 'var(--green-text)' }} />
                    <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--green-text)' }} />
                  </span>
                  <span className="type-kicker">Canon · Live team view</span>
                </div>
              </div>
              {/* Status cards — 3-across, divided by 1px gaps */}
              <div
                className="grid gap-px sm:grid-cols-3"
                style={{ backgroundColor: 'var(--border-tertiary)' }}
              >
                {statusCards.map((card, i) => {
                  const tone = toneStyles(card.tone);
                  return (
                    <div
                      key={card.title}
                      className="flex flex-col gap-3 p-5 lg:p-6"
                      style={{ backgroundColor: 'var(--bg-primary)', animation: `fade-up 0.5s ease ${0.65 + i * 0.1}s both` }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={tone.eyebrow}>
                          {card.eyebrow}
                        </p>
                        <span
                          className="shrink-0 rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold"
                          style={{ ...tone.shell, ...tone.value }}
                        >
                          {card.value}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-5" style={{ color: 'var(--text-primary)' }}>
                        {card.title}
                      </p>
                      <p className="text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                        {card.detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            STATS BAND — full-bleed bg break, gradient numbers
        ═══════════════════════════════════════════════════════════ */}
        <div style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className={`${inner} py-16 lg:py-20`}>
            <AnimateIn>
              <p className="type-kicker text-center mb-10">The cost of slow ramp</p>
            </AnimateIn>
            <div
              className="grid grid-cols-1 gap-px sm:grid-cols-3"
              style={{ backgroundColor: 'var(--border-tertiary)' }}
            >
              {statsData.map((item, i) => (
                <AnimateIn key={item.label} delay={i * 80}>
                  <div
                    className="flex flex-col gap-4 px-8 py-10"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <div
                      className={`accent-bar h-[3px] w-8 rounded-full`}
                      style={{ backgroundColor: item.accent, animationDelay: `${i * 80}ms` }}
                    />
                    <p className={`type-landing-metric ${item.gradient}`}>{item.stat}</p>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item.body}</p>
                      {item.source && (
                        <p className="mt-3 text-[11px] leading-4" style={{ color: 'var(--text-tertiary)' }}>
                          Source:{' '}
                          {item.sourceUrl ? (
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2 transition-colors hover:text-[var(--text-secondary)]"
                            >
                              {item.source}
                            </a>
                          ) : item.source}
                        </p>
                      )}
                    </div>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            PRODUCT TOUR — real app screenshots from public assets
        ═══════════════════════════════════════════════════════════ */}
        <section id="product-tour" className={`${inner} py-20 lg:py-28 scroll-mt-[88px]`}>
          <AnimateIn>
            <ProductTour
              eyebrow="Product sneak peek"
              title="A first look at the Canon workspace."
              description="Canon turns scattered enablement work into a focused application surface for onboarding, milestone tracking, source-grounded knowledge, and ongoing field readiness."
              layers={productTourLayers}
            />
          </AnimateIn>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            HOW IT WORKS — connected steps, purple rail
        ═══════════════════════════════════════════════════════════ */}
        <section id="how-it-works" className={`${inner} py-20 lg:py-28 scroll-mt-[88px]`}>
          <AnimateIn className="mb-12 max-w-xl">
            <span className="badge-hero mb-5 inline-flex">The ramp loop</span>
            <h2 className="mt-5 type-landing-h2" style={{ color: 'var(--text-primary)' }}>
              Set up once. Runs continuously.
            </h2>
            <p className="mt-4 type-landing-body" style={{ color: 'var(--text-secondary)' }}>
              Canon connects your knowledge, structures each hire&apos;s path, and monitors
              for changes that affect readiness, in a single loop that runs from first hire
              to the entire team.
            </p>
          </AnimateIn>

          {/* Steps with connecting rail */}
          <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Rail — behind the step numbers, purple */}
            <div
              className="pointer-events-none absolute top-[1.05rem] hidden h-px lg:block"
              style={{
                left: 'calc(12.5% + 1.25rem)',
                right: 'calc(12.5% + 1.25rem)',
                background: 'linear-gradient(90deg, var(--canon-purple-border), var(--canon-purple), var(--canon-purple-border))',
                opacity: 0.35,
              }}
            />
            {rampLoop.map((item, i) => (
              <AnimateIn key={item.step} delay={i * 90}>
                <div className="flex flex-col gap-4">
                  <span
                    className="step-number relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold"
                    style={{
                      borderColor: 'var(--canon-purple-border)',
                      backgroundColor: 'var(--bg-page)',
                      color: 'var(--canon-purple)',
                    }}
                  >
                    {item.step}
                  </span>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
                  <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item.body}</p>
                </div>
              </AnimateIn>
            ))}
          </div>

          {/* Mid-page CTA checkpoint */}
          <AnimateIn className="mt-12">
            <div
              className="card-hover flex flex-col items-start gap-4 rounded-[10px] border p-6 sm:flex-row sm:items-center sm:justify-between"
              style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Ready to run the loop for your next hire?
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Most teams launch a first hire path in under an hour.
                </p>
              </div>
              <Button asChild className="btn-primary-shimmer shrink-0">
                <a href={requestAccessHref} target="_blank" rel="noopener noreferrer">
                  Get Access <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </AnimateIn>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            FEATURES BAND — bg break, cards with hover glow
        ═══════════════════════════════════════════════════════════ */}
        <div style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className={`${inner} py-20 lg:py-28`}>
            <AnimateIn className="mb-12">
              <span className="badge-hero mb-5 inline-flex">What you get</span>
              <h2 className="mt-5 type-landing-h2" style={{ color: 'var(--text-primary)' }}>
                Built for every stage of the ramp cycle.
              </h2>
            </AnimateIn>

            <div className="grid gap-5 lg:grid-cols-3">
              {features.map((card, i) => (
                <AnimateIn key={card.kicker} delay={i * 80}>
                  <div
                    className="card-hover flex h-full flex-col gap-5 rounded-[12px] border p-7"
                    style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-tertiary)' }}
                  >
                    <div
                      className={`accent-bar h-[3px] w-8 rounded-full`}
                      style={{ backgroundColor: card.accent, animationDelay: `${i * 80}ms` }}
                    />
                    <div>
                      <p className="type-kicker mb-2">{card.kicker}</p>
                      <h3 className="type-landing-h3" style={{ color: 'var(--text-primary)' }}>{card.title}</h3>
                      <p className="mt-3 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>{card.body}</p>
                    </div>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            INTEGRATIONS — back to bg-page
        ═══════════════════════════════════════════════════════════ */}
        <section id="integrations" className={`${inner} py-20 lg:py-28 scroll-mt-[88px]`}>
          <div className="grid gap-12 lg:grid-cols-[0.45fr_0.55fr] lg:items-start">
            <AnimateIn>
              <span className="badge-hero mb-5 inline-flex">Integrations</span>
              <h2 className="mt-5 type-landing-h2" style={{ color: 'var(--text-primary)' }}>
                Connected to where your knowledge already lives.
              </h2>
              <p className="mt-4 type-landing-body" style={{ color: 'var(--text-secondary)' }}>
                Canon pulls context from the tools your team uses every day and keeps it
                current so briefs always reflect what is true now.
              </p>
            </AnimateIn>

            <div className="grid grid-cols-2 gap-4">
              {integrations.map((item, i) => (
                <AnimateIn key={item.name} delay={i * 70}>
                  <div
                    className="card-hover rounded-[10px] border p-5"
                    style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-primary)' }}
                  >
                    <div
                      className="mb-4 flex h-10 w-10 items-center justify-center rounded-[8px] border"
                      style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}
                    >
                      {item.icon}
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                    <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>{item.body}</p>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SECURITY BAND — third bg break
        ═══════════════════════════════════════════════════════════ */}
        <div id="security" style={{ backgroundColor: 'var(--bg-secondary)' }} className="scroll-mt-[88px]">
          <div className={`${inner} py-20 lg:py-28`}>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
              <AnimateIn>
                <span className="badge-hero mb-5 inline-flex">Security</span>
                <h2 className="mt-5 type-landing-h2" style={{ color: 'var(--text-primary)' }}>
                  Security is part of the model, not an afterthought.
                </h2>
                <ul className="mt-8 space-y-5">
                  {[
                    'OAuth sign-ins include tamper checks to prevent replayed authentication flows.',
                    'Tokens are encrypted at rest before storage.',
                    'Connected-data access requires a valid authenticated session.',
                    'Canon only reads explicitly connected sources and never writes to your tools.',
                  ].map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      <span
                        className="mt-[0.35em] h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: 'var(--canon-purple)' }}
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </AnimateIn>

              <AnimateIn delay={80}>
                <p className="type-kicker mb-4">Data flow</p>
                <div className="space-y-3">
                  {[
                    { step: '01', title: 'Connect', body: 'OAuth access to knowledge sources and communication systems.' },
                    { step: '02', title: 'Synthesize', body: 'Canon indexes content, generates briefs, and monitors for meaningful changes.' },
                    { step: '03', title: 'Route', body: 'Updates and alerts go to the channels where your team already operates.' },
                  ].map((item, i) => (
                    <div
                      key={item.step}
                      className="card-hover flex gap-4 rounded-[8px] border p-4"
                      style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-tertiary)', transitionDelay: `${i * 60}ms` }}
                    >
                      <span className="mt-px shrink-0 text-xs font-semibold tabular-nums" style={{ color: 'var(--canon-purple)' }}>
                        {item.step}
                      </span>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
                        <p className="mt-1 text-sm leading-5" style={{ color: 'var(--text-secondary)' }}>{item.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AnimateIn>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            FAQ — back to bg-page
        ═══════════════════════════════════════════════════════════ */}
        <section className={`${inner} py-20 lg:py-28`}>
          <div className="grid gap-12 lg:grid-cols-[0.45fr_0.55fr] lg:items-start">
            <AnimateIn>
              <span className="badge-hero mb-5 inline-flex">FAQ</span>
              <h2 className="mt-5 type-landing-h2" style={{ color: 'var(--text-primary)' }}>
                Common questions
              </h2>
              <p className="mt-4 type-landing-body" style={{ color: 'var(--text-secondary)' }}>
                Anything not covered?{' '}
                <a
                  href="mailto:john@usecanon.com"
                  className="underline underline-offset-2 transition-colors hover:text-[var(--text-primary)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Email us.
                </a>
              </p>
            </AnimateIn>
            <AnimateIn delay={60}>
              <FaqAccordion items={faqItems} />
            </AnimateIn>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            FINAL CTA — animated gradient border, centered
        ═══════════════════════════════════════════════════════════ */}
        <section className={`${inner} pb-28`}>
          <AnimateIn>
            {/* gradient-border-wrap provides the animated gradient border */}
            <div className="gradient-border-wrap">
              <div
                className="rounded-[13px] px-8 py-16 text-center sm:px-16"
                style={{ backgroundColor: 'var(--bg-primary)' }}
              >
                <p className="type-kicker mb-6">Get started today</p>
                <h2
                  className="mx-auto max-w-2xl type-landing-h2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Give every Technical GTM hire the shortest path to full productivity.
                </h2>
                <p
                  className="mx-auto mt-4 max-w-xl type-landing-body"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Canon replaces scattered onboarding docs and reactive enablement with a
                  single continuous loop that keeps both new hires and the broader team
                  field-ready.
                </p>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <Button size="lg" className="btn-primary-shimmer" asChild>
                    <a href={requestAccessHref} target="_blank" rel="noopener noreferrer">
                      Get Access
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button size="lg" variant="secondary" asChild>
                    <a href="mailto:john@usecanon.com">Ask a question</a>
                  </Button>
                </div>
              </div>
            </div>
          </AnimateIn>
        </section>

      </main>

      <footer className="border-t" style={{ borderColor: 'var(--border-tertiary)' }}>
        <div
          className={`${inner} flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between`}
          style={{ color: 'var(--text-tertiary)' }}
        >
          <p>© 2026 Canon</p>
          <a
            href="mailto:john@usecanon.com"
            className="transition-colors duration-[120ms] hover:text-[var(--text-primary)]"
          >
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
