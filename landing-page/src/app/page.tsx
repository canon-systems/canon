import type { Metadata } from 'next';
import { ArrowRight, Github, Slack } from 'lucide-react';

import { FaqAccordion } from '@/components/landing-page/FaqAccordion';
import { ProductTour } from '@/components/landing-page/ProductTour';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { Navigation } from '@/components/Navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const requestAccessHref = 'https://app.usecanon.com';

export const metadata: Metadata = {
  title: 'Canon | Engineering visibility that comes to you',
  description:
    "Canon turns your engineering tools into a daily briefing, so you always know what shipped, what's stuck, and what needs your attention.",
  openGraph: {
    title: 'Canon | Engineering visibility that comes to you',
    description:
      "Canon turns your engineering tools into a daily briefing, so you always know what shipped, what's stuck, and what needs your attention.",
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Canon | Engineering visibility that comes to you',
    description:
      "Canon turns your engineering tools into a daily briefing, so you always know what shipped, what's stuck, and what needs your attention.",
  },
};

const signalCards = [
  {
    eyebrow: 'Delivery Signal',
    title: 'PR merge rate dropped below baseline',
    detail: '3 pull requests are open beyond median cycle time compared with the last 7-day baseline window.',
    value: '-38%',
    tone: 'amber',
  },
  {
    eyebrow: 'Execution Signal',
    title: 'Tickets reopened above normal',
    detail: 'Four Jira tickets moved back to in-progress this window, materially above the expected baseline.',
    value: '+4',
    tone: 'rose',
  },
  {
    eyebrow: 'Momentum Signal',
    title: 'Commit velocity is stable',
    detail: 'Default branch activity remains within normal range, so leadership can focus on the true exceptions.',
    value: 'Stable',
    tone: 'emerald',
  },
] as const;

const operatingRhythm = [
  'Connect GitHub, Jira, and Slack in one session.',
  'Canon backfills recent history immediately so the first briefing has context on day one.',
  'Each window is compared to a matching baseline, not a generic benchmark.',
  'Only meaningful deltas are pushed to leadership in a briefing or alert.',
];

const evidenceLayers = [
  {
    stage: 'Connected Sources',
    title: 'Canon starts where your engineering truth already lives.',
    description:
      'A clean integration layer keeps inputs visible, healthy, and attributable so leadership never has to guess where a signal came from.',
    image: '/sources.png',
    alt: 'Canon sources view showing connected workspaces and integration status for GitHub, Jira, and Slack.',
    highlights: ['Connected workspaces', 'Integration health', 'One operating surface'],
  },
  {
    stage: 'Executive Briefing',
    title: 'Leadership gets the update in plain language.',
    description:
      'Canon turns engineering activity into a readable summary of what shipped, what is blocked, and what needs a decision.',
    image: '/executive%20briefing.png',
    alt: 'Canon executive briefing showing what shipped, what is stuck, and what needs attention this week.',
    highlights: ['Plain-language narrative', 'Action-oriented output', 'Shared context'],
  },
  {
    stage: 'History Overview',
    title: 'Baseline and current windows are easy to compare.',
    description:
      'Trend shifts are shown in context, so normal variance does not get mistaken for meaningful change.',
    image: '/history%20top.png',
    alt: 'Canon history overview showing baseline comparison and trend context across engineering systems.',
    highlights: ['Baseline comparison', 'Trend context', 'At-a-glance deltas'],
  },
  {
    stage: 'Workstream Deltas',
    title: 'Work tracking signals are visible before they become narrative debt.',
    description:
      'Ticket creation, regression, and backlog movement are laid out side by side so delivery flow is easier to interpret.',
    image: '/history%20jira.png',
    alt: 'Canon history view for Jira showing baseline comparisons and workstream movement side by side.',
    highlights: ['Flow imbalances', 'Window comparison', 'Operational clarity'],
  },
  {
    stage: 'Delivery Deltas',
    title: 'Code delivery is measured with context, not gut feel.',
    description:
      'Commits, pull requests, and velocity shifts are scored against normal behavior so teams can respond with confidence.',
    image: '/history%20github.png',
    alt: 'Canon history view for GitHub showing baseline comparisons and delivery metrics over the active window.',
    highlights: ['Commit context', 'Velocity shifts', 'Delivery patterns'],
  },
  {
    stage: 'Source Evidence',
    title: 'Every surfaced signal can be opened and verified.',
    description:
      'Canon gives leaders the evidence trail behind the summary so an alert can be trusted before it triggers follow-up.',
    image: '/investigate%20top.png',
    alt: 'Canon investigate page showing baseline context, directional movers, and summary metrics for a briefing item.',
    highlights: ['Explainable briefings', 'Baseline rationale', 'Top movers'],
  },
  {
    stage: 'Event Detail',
    title: 'Granular activity stays within reach when the stakes are higher.',
    description:
      'From the signal, you can drill into the underlying records and verify exactly what changed inside the active window.',
    image: '/investigate%20bottom.png',
    alt: 'Canon investigate page lower section with detailed activity and breakdown panels for event-level verification.',
    highlights: ['Granular records', 'Traceable evidence', 'Decision confidence'],
  },
] as const;

const faqItems = [
  {
    question: 'What tools does Canon connect to?',
    answer:
      "Canon currently connects to GitHub, Jira, and Slack, with more integrations on the way. If your stack isn't listed, reach out at john@usecanon.com and we'll let you know what's coming.",
  },
  {
    question: 'Will I get a briefing every single day?',
    answer:
      "Only when there's something worth telling you. If nothing meaningful changed in your engineering systems, Canon stays quiet.",
  },
  {
    question: 'How does Canon decide what is meaningful?',
    answer:
      'Canon compares your current activity window to a matching baseline window of the same length, then surfaces deviations that materially differ from what is normal for your team.',
  },
  {
    question: 'How long does setup take?',
    answer:
      'Most teams are connected and receiving their first briefing within a single session. No heavy implementation, dashboard project, or custom rules engine required.',
  },
  {
    question: 'Who is Canon built for?',
    answer:
      'Canon is built for technical founders, CTOs, and VPs/Heads/Directors of Engineering who need operating visibility without building a reporting stack.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. Canon uses OAuth for integrations, encrypts tokens at rest, and only reads from explicitly connected workspaces and repositories. Canon never writes to your tools.',
  },
];

function toneClasses(tone: (typeof signalCards)[number]['tone']) {
  if (tone === 'amber') {
    return {
      shell: 'border-amber-300/30 bg-[linear-gradient(180deg,rgba(255,251,235,0.16),rgba(255,251,235,0.04))]',
      eyebrow: 'text-amber-200/90',
      value: 'text-amber-100',
      pill: 'border-amber-200/25 bg-amber-200/10 text-amber-50',
    };
  }

  if (tone === 'rose') {
    return {
      shell: 'border-rose-300/30 bg-[linear-gradient(180deg,rgba(255,241,242,0.16),rgba(255,241,242,0.04))]',
      eyebrow: 'text-rose-200/90',
      value: 'text-rose-100',
      pill: 'border-rose-200/25 bg-rose-200/10 text-rose-50',
    };
  }

  return {
    shell: 'border-emerald-300/30 bg-[linear-gradient(180deg,rgba(236,253,245,0.14),rgba(236,253,245,0.04))]',
    eyebrow: 'text-emerald-200/90',
    value: 'text-emerald-100',
    pill: 'border-emerald-200/25 bg-emerald-200/10 text-emerald-50',
  };
}

export default function LandingPage() {
  return (
    <div className="relative min-h-screen text-white">
      <Navigation />

      <main className="relative overflow-hidden">
        <section
          id="features"
          className="mx-auto max-w-[94rem] px-4 pb-20 pt-10 sm:px-6 lg:px-8 lg:pb-24 lg:pt-16 scroll-mt-[88px]"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem]">
            <div className="absolute left-[6%] top-10 h-72 w-72 rounded-full bg-cyan-300/12 blur-3xl" />
            <div className="absolute right-[10%] top-24 h-80 w-80 rounded-full bg-amber-200/10 blur-3xl" />
            <div className="absolute left-1/3 top-52 h-96 w-96 rounded-full bg-fuchsia-300/8 blur-3xl" />
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div className="space-y-8">
              <div className="space-y-5">
                <Badge className="border-white/15 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-white/80 hover:bg-white/8">
                  Built for engineering leaders
                </Badge>
                <div className="max-w-4xl space-y-5">
                  <h1 className="font-display text-5xl font-semibold leading-[0.94] tracking-[-0.04em] text-white sm:text-6xl lg:text-[5.8rem]">
                    Engineering visibility that comes to you.
                  </h1>
                  <p className="max-w-2xl text-base leading-8 text-white/74 sm:text-lg">
                    Canon turns your engineering tools into a daily briefing, so you always know what shipped, what's stuck, and what needs your attention. Only when there's something worth saying.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" className="h-12 rounded-full bg-white px-6 text-black hover:bg-white/90" asChild>
                  <a href={requestAccessHref} target="_blank" rel="noopener noreferrer">
                    Request Access
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12 rounded-full border border-white/15 bg-white/8 px-6 text-white hover:bg-white/12"
                  asChild
                >
                  <a href="#product-tour">See the product</a>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['What shipped', 'A concise record of delivered work, straight from your tools.'],
                  ["What's stuck", 'Blockers and regressions surfaced before they become leadership surprises.'],
                  ['What needs you', 'Signals routed only when a decision or intervention is actually needed.'],
                ].map(([title, body]) => (
                  <div
                    key={title}
                    className="rounded-[1.75rem] border border-white/10 bg-[#0f1012] p-5"
                  >
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/62">{body}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 rounded-[2rem] border border-white/10 bg-[#111214] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-white">No briefing for the sake of it.</p>
                  <p className="mt-1 text-sm text-white/62">
                    Canon stays quiet when engineering is operating within baseline.
                  </p>
                </div>
                <div className="rounded-full border border-white/12 bg-black/35 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/72">
                  Only when it matters
                </div>
              </div>
            </div>

            <div className="space-y-5 lg:pt-10">
              <div className="rounded-[2.2rem] border border-white/10 bg-[#111214] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/55">
                      Canon detected
                    </p>
                    <p className="mt-2 text-sm text-white/65">An executive-ready view of engineering momentum.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {signalCards.map((card) => {
                    const tone = toneClasses(card.tone);
                    return (
                      <div
                        key={card.title}
                        className={`rounded-[1.6rem] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${tone.shell}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${tone.eyebrow}`}>
                              {card.eyebrow}
                            </p>
                            <p className="mt-2 text-base font-medium text-white">{card.title}</p>
                            <p className="mt-2 max-w-md text-sm leading-6 text-white/62">{card.detail}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-display text-3xl font-semibold tracking-[-0.04em] ${tone.value}`}>
                              {card.value}
                            </p>
                            <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] ${tone.pill}`}>
                              surfaced
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-4 text-xs uppercase tracking-[0.2em] text-white/38">
                  Severity is scored against your configured baseline window.
                </p>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-[#0d0e10] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/55">Monday briefing</p>
                <p className="mt-3 max-w-lg font-display text-2xl font-semibold tracking-[-0.03em] text-white">
                  A calm, high-signal summary that leadership can read in minutes.
                </p>
                <p className="mt-3 max-w-lg text-sm leading-6 text-white/62">
                  Canon sends the findings to the user, with context already assembled, so leadership does not have to
                  go looking for meaning across dashboards and tools.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[94rem] px-4 pb-20 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="relative overflow-hidden rounded-[2.4rem] border border-cyan-300/15 bg-[linear-gradient(145deg,rgba(18,24,32,0.98),rgba(12,13,15,1))] p-8 shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.14),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(253,230,138,0.08),transparent_30%)]" />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-100/68">Why Canon is different</p>
                <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                  Leaders should not have to assemble the story of engineering by hand.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-white/68">
                  Canon closes the gap between raw engineering activity and executive understanding by pushing findings to
                  the user, not by asking leaders to live in another analytics surface.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="relative overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-[linear-gradient(180deg,rgba(16,17,19,1),rgba(10,11,13,1))] p-7">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-sky-400 to-cyan-200" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/58">Search tax</p>
                <p className="mt-4 font-display text-5xl font-semibold tracking-[-0.05em] text-white sm:text-6xl">25%</p>
                <p className="mt-4 text-sm leading-7 text-white/64">
                  Executives and teams spend a quarter of the workweek searching for information about what is happening
                  across the organization.
                </p>
              </div>
              <div className="relative overflow-hidden rounded-[2rem] border border-amber-300/15 bg-[linear-gradient(180deg,rgba(16,17,19,1),rgba(10,11,13,1))] p-7">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-200 via-yellow-300 to-orange-200" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-100/58">Confidence gap</p>
                <p className="mt-4 font-display text-5xl font-semibold tracking-[-0.05em] text-white sm:text-6xl">7%</p>
                <p className="mt-4 text-sm leading-7 text-white/64">
                  Only a small minority of leaders feel confident they understand how team activity connects to company
                  priorities.
                </p>
              </div>
              <div className="relative overflow-hidden rounded-[2rem] border border-amber-300/15 bg-[linear-gradient(135deg,rgba(250,204,21,0.08),rgba(17,18,20,1))] p-7 sm:col-span-2">
                <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-amber-200/10 blur-2xl" />
                <p className="text-sm leading-7 text-white/66">
                  Source: Atlassian State of Teams 2025, surveying 200 Fortune 1000 executives and 12,000 knowledge
                  workers.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="mx-auto max-w-[94rem] px-4 pb-20 sm:px-6 lg:px-8 scroll-mt-[88px]">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
            <div className="space-y-4">
              <Badge className="border-white/12 bg-white/7 text-white/75 hover:bg-white/7">Operating rhythm</Badge>
              <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                Set up once. Get context every time it actually matters.
              </h2>
              <p className="max-w-xl text-base leading-8 text-white/68">
                Canon works like an operating layer between your engineering systems and the places leadership already
                pays attention.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {operatingRhythm.map((step, index) => (
                <div
                  key={step}
                  className="rounded-[1.9rem] border border-white/10 bg-[#101113] p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-xs font-semibold text-white/78">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/48">Step {index + 1}</p>
                  </div>
                  <p className="mt-5 text-base leading-7 text-white/72">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[94rem] px-4 pb-20 sm:px-6 lg:px-8" id="product-tour">
          <ProductTour
            eyebrow="Product tour"
            title="From signal to source evidence in one surface."
            description="Canon should feel legible at every zoom level. Start with the briefing, then move into baseline context, workstream deltas, and event-level verification when needed."
            layers={evidenceLayers}
          />
        </section>

        <section className="mx-auto max-w-[94rem] px-4 pb-20 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="group relative overflow-hidden rounded-[2rem] border border-cyan-300/12 bg-[linear-gradient(180deg,rgba(16,17,19,1),rgba(11,12,14,1))] p-7 shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_34%)] opacity-70" />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100/58">Leadership use case</p>
                <h3 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-white">
                  Decide where to intervene.
                </h3>
                <p className="mt-4 text-sm leading-7 text-white/66">
                  Canon is built for operating questions: where momentum changed, what became risky, and what deserves
                  immediate communication.
                </p>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-[2rem] border border-amber-300/12 bg-[linear-gradient(180deg,rgba(16,17,19,1),rgba(11,12,14,1))] p-7 shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(253,230,138,0.1),transparent_34%)] opacity-70" />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-100/58">Operating model</p>
                <h3 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-white">
                  Baseline, not guesswork.
                </h3>
                <p className="mt-4 text-sm leading-7 text-white/66">
                  Signals are scored against a configurable baseline window so leadership sees meaningful change instead of
                  raw volume.
                </p>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-[2rem] border border-emerald-300/12 bg-[linear-gradient(180deg,rgba(16,17,19,1),rgba(11,12,14,1))] p-7 shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/50 to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.1),transparent_34%)] opacity-70" />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-100/58">Evidence model</p>
                <h3 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-white">
                  Traceable before actionable.
                </h3>
                <p className="mt-4 text-sm leading-7 text-white/66">
                  Every briefing can be followed down to supporting activity context before a leader escalates or
                  reprioritizes.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="mx-auto max-w-[94rem] px-4 pb-20 sm:px-6 lg:px-8 scroll-mt-[88px]"
          id="integrations"
        >
          <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="space-y-4">
              <Badge className="border-white/12 bg-white/7 text-white/75 hover:bg-white/7">Integrations</Badge>
              <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                Inputs from the systems your team already trusts.
              </h2>
              <p className="text-base leading-8 text-white/68">
                Canon connects to where engineering work is actually happening, then routes the output back into the
                channels where leadership already operates.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[2rem] border border-white/10 bg-[#101113] p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-black/30">
                  <Github className="h-6 w-6 text-white" aria-hidden />
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.03em] text-white">GitHub</h3>
                <p className="mt-3 text-sm leading-7 text-white/64">
                  Track pull request flow, commit activity, and delivery trend shifts with baseline context.
                </p>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-[#101113] p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-black/30">
                  <IntegrationLogos provider="atlassian" size={24} />
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.03em] text-white">Jira</h3>
                <p className="mt-3 text-sm leading-7 text-white/64">
                  Understand ticket movement, backlog pressure, and workstream regressions before they spread.
                </p>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-[#101113] p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-black/30">
                  <Slack className="h-6 w-6 text-white" aria-hidden />
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.03em] text-white">Slack</h3>
                <p className="mt-3 text-sm leading-7 text-white/64">
                  Deliver briefings and alerts into the communication layer your team already checks first.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="mx-auto max-w-[94rem] px-4 pb-20 sm:px-6 lg:px-8 scroll-mt-[88px]"
          id="security"
        >
          <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
            <div className="rounded-[2.2rem] border border-white/10 bg-[#101113] p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/48">Security</p>
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                Security is part of the operating model, not an afterthought.
              </h2>
              <ul className="mt-6 space-y-4 text-sm leading-7 text-white/68">
                <li className="flex gap-3">
                  <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
                  OAuth sign-ins include tamper checks to prevent replayed authentication flows.
                </li>
                <li className="flex gap-3">
                  <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
                  Tokens are encrypted at rest before storage.
                </li>
                <li className="flex gap-3">
                  <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
                  Connected-data access requires a valid authenticated session.
                </li>
                <li className="flex gap-3">
                  <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
                  Canon only reads explicitly connected workspaces and repositories, and never writes to your tools.
                </li>
              </ul>
            </div>

            <div className="rounded-[2.2rem] border border-white/10 bg-[#111214] p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/48">Data flow</p>
              <div className="mt-6 space-y-4">
                {[
                  ['Connect', 'OAuth access to source code, work tracking, and communication systems.'],
                  ['Compute', 'Canon encrypts tokens, ingests events, and scores deviations against baseline.'],
                  ['Route', 'Briefings and alerts go to the channels where operating decisions already happen.'],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-[1.5rem] border border-white/10 bg-[#0b0c0e] p-5">
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/62">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[94rem] px-4 pb-20 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[0.74fr_1.26fr]">
            <div className="space-y-4">
              <Badge className="border-white/12 bg-white/7 text-white/75 hover:bg-white/7">FAQ</Badge>
              <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                Common questions
              </h2>
            </div>

            <FaqAccordion items={faqItems} />
          </div>
        </section>

        <section className="mx-auto max-w-[94rem] px-4 pb-20 sm:px-6 lg:px-8">
          <div className="rounded-[2.5rem] border border-white/10 bg-[linear-gradient(140deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-8 sm:p-10 lg:p-12">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/48">Final call</p>
                <h2 className="mt-4 font-display text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                  Give leadership one source of truth for engineering movement.
                </h2>
                <p className="mt-4 text-base leading-8 text-white/68">
                  Canon replaces reactive status gathering with a readable operating layer grounded in the systems your
                  team already uses every day.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="h-12 rounded-full bg-white px-6 text-black hover:bg-white/90" asChild>
                  <a href={requestAccessHref} target="_blank" rel="noopener noreferrer">
                    Request Access
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12 rounded-full border border-white/15 bg-white/8 px-6 text-white hover:bg-white/12"
                  asChild
                >
                  <a href="mailto:john@usecanon.com">Ask a question</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-[94rem] flex-col gap-4 px-4 py-10 text-white/62 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© 2026 Canon</p>
          <a href="mailto:john@usecanon.com" className="transition hover:text-white">
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
