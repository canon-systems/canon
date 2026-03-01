'use client';

import { ArrowRight, Github, Slack, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { IntegrationLogos } from '@/components/IntegrationLogos';
import { Navigation } from '@/components/Navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function LandingPage() {
  const appHref = 'https://app.usecanon.com';
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const [activeEvidenceIndex, setActiveEvidenceIndex] = useState(0);
  const evidenceCardRefs = useRef<Array<HTMLElement | null>>([]);
  const evidenceVisibilityRatios = useRef<Map<number, number>>(new Map());
  const evidenceLayers = [
    {
      stage: 'Connected Sources',
      title: 'Where Execution Data Lives',
      description:
        'Canon connects to the systems where work actually happens—repositories, boards, and channels—so every signal is grounded in real activity.',
      image: '/sources.png',
      alt: 'Canon sources view showing connected workspaces and integration status.',
      highlights: ['Connected workspaces', 'Integration health', 'Single pane for inputs'],
    },
    {
      stage: 'Executive Briefing',
      title: 'Decision-Ready Narrative for Leadership',
      description:
        'Canon transforms detected shifts into a concise executive briefing so leaders can align on risk, momentum, and next actions in minutes.',
      image: '/executive%20briefing.png',
      alt: 'Canon executive briefing view showing prioritized updates and leadership-ready narrative context.',
      highlights: ['Leadership narrative output', 'Action-oriented summary', 'Cross-team alignment context'],
    },
    {
      stage: 'History Overview',
      title: 'Baseline and Deltas at a Glance',
      description:
        'See how metrics and momentum compare to baseline so teams can separate normal variance from material execution change.',
      image: '/history%20top.png',
      alt: 'Canon history overview with baseline comparison and trend context.',
      highlights: ['Baseline comparison', 'Trend context', 'At-a-glance deltas'],
    },
    {
      stage: 'Workstream Deltas',
      title: 'Work Tracking: Baseline vs Current, Side by Side',
      description:
        'Ticket and workstream movement is shown as clear deltas so backlog flow, blockers, and completion dynamics stay visible.',
      image: '/history%20jira.png',
      alt: 'Canon history view for a work tracking system showing baseline comparisons and workstream movement.',
      highlights: ['Directional movement panels', 'Current vs baseline windows', 'Execution trend clarity'],
    },
    {
      stage: 'Delivery Deltas',
      title: 'Code Delivery: Velocity in Context',
      description:
        'Delivery and code activity are compared to baseline so commits, PR flow, and execution trend shifts are easy to interpret.',
      image: '/history%20github.png',
      alt: 'Canon history view for a source code platform showing baseline comparisons and delivery metrics.',
      highlights: ['Commit and PR context', 'Velocity vs baseline', 'Delivery trend clarity'],
    },
    {
      stage: 'Source Evidence',
      title: 'Open the Evidence Dossier',
      description:
        'Every claim is backed by underlying activity context so teams can validate why a signal was raised before acting.',
      image: '/investigate%20top.png',
      alt: 'Canon investigate page top section with baseline context, directional movers, and summary metrics.',
      highlights: ['Baseline context', 'Top directional movers', 'Explainable signal rationale'],
    },
    {
      stage: 'Event-Level Detail',
      title: 'Trace the Underlying Events',
      description:
        'Drill from the summary into granular records to confirm exactly what moved in the active window.',
      image: '/investigate%20bottom.png',
      alt: 'Canon investigate page lower section with detailed activity and breakdown panels.',
      highlights: ['Granular activity records', 'Window-by-window comparison', 'Verification before escalation'],
    },
  ];

  useEffect(() => {
    evidenceCardRefs.current = evidenceCardRefs.current.slice(0, evidenceLayers.length);
    evidenceVisibilityRatios.current = new Map();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.layerIndex);
          if (Number.isNaN(idx)) continue;
          evidenceVisibilityRatios.current.set(idx, entry.isIntersecting ? entry.intersectionRatio : 0);
        }

        let nextActive = 0;
        let highestRatio = -1;
        for (const [idx, ratio] of evidenceVisibilityRatios.current.entries()) {
          if (ratio > highestRatio) {
            highestRatio = ratio;
            nextActive = idx;
          }
        }

        if (highestRatio > 0) {
          setActiveEvidenceIndex((prev) => (prev === nextActive ? prev : nextActive));
        }
      },
      {
        threshold: [0.2, 0.35, 0.5, 0.65, 0.8],
        rootMargin: '-15% 0px -35% 0px',
      }
    );

    for (const cardRef of evidenceCardRefs.current) {
      if (cardRef) observer.observe(cardRef);
    }

    return () => observer.disconnect();
  }, [evidenceLayers.length]);

  return (
    <div className="relative min-h-screen text-white">
      <Navigation />

      <main className="relative">
        <section id="features" className="mx-auto max-w-[90rem] px-4 pb-12 pt-10 sm:px-6 lg:px-8 lg:pb-16 lg:pt-16 scroll-mt-[77px]">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="animate-rise space-y-6">
              <Badge variant="secondary">Automated Knowledge Infrastructure</Badge>
              <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Canon Turns Execution Noise Into Leadership Signal.
              </h1>
              <p className="leading-relaxed text-white/85">
                Canon continuously reads real work across engineering systems, detects meaningful shifts, and delivers
                daily and weekly guidance leaders can act on.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" asChild>
                  <a href={appHref} target="_blank" rel="noopener noreferrer">
                    Open Canon
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <a href="#workflow">See the Operating Loop</a>
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/25 bg-white/[0.03] p-4">
                  <p className="font-medium text-white">Change Visibility</p>
                  <p className="mt-1 text-white/80">See meaningful delivery and dependency shifts as they happen.</p>
                </div>
                <div className="rounded-2xl border border-white/25 bg-white/[0.03] p-4">
                  <p className="font-medium text-white">Execution Clarity</p>
                  <p className="mt-1 text-white/80">Understand what changed and why it matters right now.</p>
                </div>
                <div className="rounded-2xl border border-white/25 bg-white/[0.03] p-4">
                  <p className="font-medium text-white">Faster Decisions</p>
                  <p className="mt-1 text-white/80">Route the right signal to the right owner, fast.</p>
                </div>
              </div>
            </div>

            <div className="animate-rise animate-rise-delay-1 space-y-4">
              <div className="rounded-3xl border border-white/25 bg-white/[0.03] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">Daily Signal</p>
                  <Badge variant="secondary">Live</Badge>
                </div>
                <Separator className="my-4" />
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Delivery Status</span>
                    <span className="font-medium text-white">Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Execution Health</span>
                    <span className="font-medium text-white/80">Stable</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Momentum</span>
                    <span className="font-medium text-white/80">Down 12%</span>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="rounded-2xl border border-white/25 bg-white/[0.03] p-4 text-white/80">
                  Canon highlights meaningful shifts and links every claim to source evidence.
                </div>
              </div>
              <div className="rounded-3xl border border-white/25 bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.01] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">Output Cadence</p>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-white/25 bg-white/[0.05] p-3 text-center text-white">
                    Daily
                    <p className="text-xs text-white/80">Priority Signals</p>
                  </div>
                  <div className="rounded-2xl border border-white/25 bg-white/[0.05] p-3 text-center text-white">
                    Weekly
                    <p className="text-xs text-white/80">Trend Insight</p>
                  </div>
                  <div className="rounded-2xl border border-white/25 bg-white/[0.05] p-3 text-center text-white">
                    On-Change
                    <p className="text-xs text-white/80">Change Alerts</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[90rem] px-4 pb-16 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge variant="secondary">What You Get</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Canon Is an Operating Layer for Leadership Decisions.
              </h2>
              <p className="max-w-3xl text-white/85">
                Instead of waiting for status rollups, leaders get a continuous signal stream: what changed, where
                momentum is rising or slowing, and what should be addressed first.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="h-full bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.01]">
                <CardHeader>
                  <CardTitle className="text-white">Daily Signal</CardTitle>
                  <CardDescription className="text-white/85">Decision-ready summary every day.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-white/85">Net momentum and the most important changes.</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-white">Weekly Insight</CardTitle>
                  <CardDescription className="text-white/85">Trends over time, not just snapshots.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-white/85">Track trajectory by team, initiative, or workspace.</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-white">Canonical History</CardTitle>
                  <CardDescription className="text-white/85">Meaningful deltas with context.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-white/85">Cut through noise and review changes that actually impact outcomes.</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-white">Change Alerts</CardTitle>
                  <CardDescription className="text-white/85">Surface issues when they need attention.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-white/85">Route important shifts to owners before they become blockers.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[90rem] px-4 pb-16 sm:px-6 lg:px-8 scroll-mt-[77px]" id="workflow">
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge variant="secondary">Operating Loop</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                How Canon Works in Production.
              </h2>
              <p className="max-w-3xl text-white/85">
                Canon sits between raw execution data and leadership decisions, so every signal is timely, explainable,
                and tied to source evidence.
              </p>
            </div>

            <div className="glass-panel p-6 sm:p-8">
              <div className="grid gap-4 sm:grid-cols-4">
                {[
                  {
                    title: 'Ingest',
                    body: 'Read activity from connected systems.',
                    accent: 'from-cyan-400/30 via-blue-400/20 to-white/0',
                  },
                  {
                    title: 'Normalize',
                    body: 'Convert events into a consistent canonical model.',
                    accent: 'from-emerald-400/30 via-teal-400/20 to-white/0',
                  },
                  {
                    title: 'Detect',
                    body: 'Compute significant changes and trend shifts.',
                    accent: 'from-amber-400/30 via-orange-400/20 to-white/0',
                  },
                  {
                    title: 'Deliver',
                    body: 'Route concise summaries and alerts to leadership channels.',
                    accent: 'from-violet-400/30 via-purple-400/20 to-white/0',
                  },
                ].map((step, idx) => (
                  <div
                    key={step.title}
                    className="relative overflow-hidden rounded-2xl border border-white/25 bg-white/[0.03] p-4 shadow-[0_12px_50px_rgba(0,0,0,0.45)]"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${step.accent}`} aria-hidden />
                    <div className="relative flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-white/80">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] font-semibold">
                          {idx + 1}
                        </span>
                        {step.title}
                      </div>
                      <p className="text-white/80">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[90rem] px-4 pb-16 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge variant="secondary">Product Tour</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                See Canon Capabilities in Action.
              </h2>
              <p className="max-w-3xl text-white/85">
                Canon turns execution data into clear operating context, with fast investigations, source-level detail,
                and a complete action trail for confident decisions.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[0.52fr_1.48fr] lg:items-start">
              <div className="glass-panel p-6 sm:p-7 lg:sticky lg:top-24">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Reveal Sequence</p>
                <h3 className="mt-3 font-display text-2xl font-semibold text-white">From Brief to Ground Truth</h3>
                <p className="mt-3 text-white/80">
                  Instead of static screenshots, the stack reveals how each layer strengthens confidence before a
                  leadership action is taken.
                </p>
                <div className="mt-6 space-y-2">
                  {evidenceLayers.map((layer, idx) => (
                    <div
                      key={layer.stage}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${
                        activeEvidenceIndex === idx
                          ? 'border-white bg-white text-black shadow-[0_12px_30px_rgba(0,0,0,0.45)]'
                          : 'border-white/20 bg-white/[0.03] text-white/80'
                      }`}
                    >
                      <span>{layer.stage}</span>
                      <span className={`font-medium ${activeEvidenceIndex === idx ? 'text-black' : 'text-white/90'}`}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6 pb-4 lg:pt-8">
                {evidenceLayers.map((layer, idx) => (
                  <article
                    key={layer.title}
                    ref={(el) => {
                      evidenceCardRefs.current[idx] = el;
                    }}
                    data-layer-index={idx}
                    className={`relative rounded-3xl border p-4 shadow-[0_24px_70px_rgba(0,0,0,0.5)] transition-all duration-300 sm:p-6 ${
                      activeEvidenceIndex === idx
                        ? 'border-white bg-white text-black'
                        : 'border-white/25 bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.015]'
                    }`}
                    style={{ zIndex: evidenceLayers.length - idx }}
                  >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={activeEvidenceIndex === idx ? 'border-black/25 bg-black/10 text-black' : undefined}
                        >
                          Layer {String(idx + 1).padStart(2, '0')}
                        </Badge>
                        <p
                          className={`text-xs font-semibold uppercase tracking-[0.22em] ${
                            activeEvidenceIndex === idx ? 'text-black/70' : 'text-white/70'
                          }`}
                        >
                          {layer.stage}
                        </p>
                      </div>
                    </div>

                    <div className="group relative overflow-hidden rounded-2xl border border-white/25 bg-black/60">
                      <button
                        type="button"
                        onClick={() => setExpandedImage({ src: layer.image, alt: layer.alt })}
                        className="block w-full cursor-zoom-in"
                        aria-label={`Expand image for ${layer.title}`}
                      >
                        <Image
                          src={layer.image}
                          alt={layer.alt}
                          width={3442}
                          height={1922}
                          className="h-auto w-full object-cover"
                        />
                        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-white/30 bg-black/65 px-3 py-1 text-xs text-white/90 opacity-95 transition group-hover:bg-black/75">
                          Click to expand
                        </span>
                      </button>
                    </div>

                    <div className="mt-5">
                      <h3
                        className={`font-display text-xl font-semibold sm:text-2xl ${
                          activeEvidenceIndex === idx ? 'text-black' : 'text-white'
                        }`}
                      >
                        {layer.title}
                      </h3>
                      <p className={`mt-3 ${activeEvidenceIndex === idx ? 'text-black/80' : 'text-white/85'}`}>
                        {layer.description}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {layer.highlights.map((highlight) => (
                          <span
                            key={highlight}
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                              activeEvidenceIndex === idx
                                ? 'border-black/20 bg-black/10 text-black'
                                : 'border-white/20 bg-white text-black'
                            }`}
                          >
                            {highlight}
                          </span>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[90rem] px-4 pb-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="glass-panel p-8">
              <h3 className="font-display text-2xl font-semibold">What Leaders Decide With Canon</h3>
              <p className="mt-3 text-white/85">
                Canon is built for operating decisions: where to intervene, what to prioritize, and how to communicate
                changes and momentum clearly across the business.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Badge variant="outline">Delivery Trends</Badge>
                <Badge variant="outline">Execution Health</Badge>
                <Badge variant="outline">Team Momentum</Badge>
                <Badge variant="outline">Cross-Team Alignment</Badge>
                <Badge variant="outline">Change Priority</Badge>
              </div>
              <Separator className="my-6" />
              <p className="text-white/85">
                Every signal is traceable to source events so decisions stay grounded in reality.
              </p>
            </div>
            <div className="glass-panel p-8">
              <h3 className="font-display text-2xl font-semibold">Control and Governance</h3>
              <p className="mt-3 text-white/85">
                Canon supports automation where safe and human review where needed.
              </p>
              <div className="mt-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Auto-Send</p>
                    <p className="text-white/85">Routine digests and stable patterns.</p>
                  </div>
                  <Badge>Routine</Badge>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Queue + Confirm</p>
                    <p className="text-white/85">Default review path for material updates.</p>
                  </div>
                  <Badge variant="secondary">Default</Badge>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Escalate</p>
                    <p className="text-white/85">Material shifts requiring immediate leadership attention.</p>
                  </div>
                  <Badge variant="outline">High Priority</Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[90rem] px-4 pb-16 sm:px-6 lg:px-8 scroll-mt-[77px]" id="integrations">
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge variant="secondary">Integrations</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Inputs From Core Systems. Outputs to Operating Channels.
              </h2>
              <p className="max-w-3xl text-white/85">
                Canon connects to where execution happens and delivers back into where decisions happen.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              <Card className="h-full bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.01]">
                <CardHeader>
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/25 bg-white/5">
                      <Github className="h-6 w-6 text-white" />
                    </div>
                    <CardTitle className="text-white">Source Code Platforms</CardTitle>
                  </div>
                  <CardDescription className="text-white/85">Code activity and delivery velocity.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-white/85">Track commits, PR flow, and execution trend shifts.</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/25 bg-white/5">
                      <IntegrationLogos provider="atlassian" size={24} />
                    </div>
                    <CardTitle className="text-white">Work Tracking Platforms</CardTitle>
                  </div>
                  <CardDescription className="text-white/85">Workstream and ticket movement.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-white/85">Understand backlog flow, blockers, and completion dynamics.</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/25 bg-white/5">
                      <Slack className="h-6 w-6 text-white" />
                    </div>
                    <CardTitle className="text-white">Slack</CardTitle>
                  </div>
                  <CardDescription className="text-white/85">Signals in leadership communication flow.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-white/85">Route daily signals, weekly insights, and change alerts to the right channels.</p>
                </CardContent>
              </Card>
              <Card className="sm:col-span-3 min-h-[110px] bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-white/[0.02]">
                <CardContent className="flex h-full items-center justify-center px-6 py-6">
                  <p className="max-w-4xl text-center text-sm text-white/85">
                    Need another tool in your stack? Canon can integrate with additional systems based on your operating environment.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[90rem] px-4 pb-16 sm:px-6 lg:px-8 scroll-mt-[77px]" id="security">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="glass-panel p-6 sm:p-8">
              <h3 className="font-display text-xl font-semibold text-white">Security, By Default</h3>
              <ul className="mt-4 space-y-3 text-white/85">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" />
                  <span>OAuth sign-ins include tamper checks to prevent replayed authentication flows.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" />
                  <span>Tokens are encrypted at rest before storage.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" />
                  <span>Connected-data access requires a valid authenticated session.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" />
                  <span>Canon only reads explicitly connected workspaces and repositories.</span>
                </li>
              </ul>
            </div>
            <div className="glass-panel p-6 sm:p-8">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.25em] text-white/80">
                <span>Data Flow</span>
                <span>At a Glance</span>
              </div>
              <Separator className="my-4" />
              <div className="space-y-4">
                <div className="rounded-xl border border-white/25 bg-white/[0.04] px-4 py-3 font-medium text-white">
                  Connect
                  <p className="text-xs font-normal text-white/80">OAuth to source, work tracking, and communication systems</p>
                </div>
                <div className="rounded-xl border border-white/25 bg-white/[0.06] px-4 py-3 font-medium text-white">
                  Canon
                  <p className="text-xs font-normal text-white/80">Encrypt tokens &rarr; ingest events &rarr; compute signals</p>
                </div>
                <div className="rounded-xl border border-white/25 bg-white/[0.04] px-4 py-3 font-medium text-white">
                  Outputs
                  <p className="text-xs font-normal text-white/80">Daily signal, weekly insight, change alerts</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[90rem] px-4 pb-16 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-white/25 bg-white/[0.03] p-8 sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                  Replace Status Theater with Signal.
                </h2>
                <p className="mt-2 max-w-2xl text-white/85">
                  Canon gives leadership a reliable view of execution and momentum, updated continuously from real
                  system activity.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <a href={appHref} target="_blank" rel="noopener noreferrer">
                    Open Canon
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <a href="mailto:john@usecanon.com">Ask a Question</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {expandedImage && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded product image"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-h-[92vh] w-full max-w-[1600px]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setExpandedImage(null)}
              className="absolute right-2 top-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/75 text-white transition hover:bg-black"
              aria-label="Close expanded image"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="overflow-hidden rounded-2xl border border-white/25 bg-black/90 shadow-[0_30px_100px_rgba(0,0,0,0.75)]">
              <Image
                src={expandedImage.src}
                alt={expandedImage.alt}
                width={3442}
                height={1922}
                className="h-auto max-h-[90vh] w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      <footer className="relative border-t border-white/25">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-4 px-4 py-10 text-white/80 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© 2026 Canon</p>
          <a href="mailto:john@usecanon.com" className="transition hover:text-white">
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
