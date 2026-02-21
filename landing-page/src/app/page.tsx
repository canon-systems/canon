import { ArrowRight, Github, Slack } from 'lucide-react';

import { IntegrationLogos } from '@/components/IntegrationLogos';
import { Navigation } from '@/components/Navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function LandingPage() {
  const appHref = 'https://sync-swart.vercel.app/login';

  return (
    <div className="relative min-h-screen text-white">
      <Navigation />

      <main className="relative">
        <section id="features" className="mx-auto max-w-7xl px-4 pb-12 pt-10 sm:px-6 lg:px-8 lg:pb-16 lg:pt-16 scroll-mt-[77px]">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="animate-rise space-y-6">
              <Badge variant="secondary">Automated Knowledge Infrastructure</Badge>
              <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Canon turns execution noise into leadership signal.
              </h1>
              <p className="text-lg leading-relaxed text-white/85">
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
                  <p className="text-sm font-medium text-white">Change Visibility</p>
                  <p className="mt-1 text-sm text-white/80">See meaningful delivery and dependency shifts as they happen.</p>
                </div>
                <div className="rounded-2xl border border-white/25 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">Execution Clarity</p>
                  <p className="mt-1 text-sm text-white/80">Understand what changed and why it matters right now.</p>
                </div>
                <div className="rounded-2xl border border-white/25 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">Faster Decisions</p>
                  <p className="mt-1 text-sm text-white/80">Route the right signal to the right owner, fast.</p>
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
                <div className="space-y-4 text-sm">
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
                <div className="rounded-2xl border border-white/25 bg-white/[0.03] p-4 text-sm text-white/80">
                  Canon highlights meaningful shifts and links every claim to source evidence.
                </div>
              </div>
              <div className="rounded-3xl border border-white/25 bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.01] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">Output Cadence</p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
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

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge variant="secondary">What You Get</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Canon is an operating layer for leadership decisions.
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
                  <p className="text-sm text-white/85">Net momentum and the most important changes.</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-white">Weekly Insight</CardTitle>
                  <CardDescription className="text-white/85">Trends over time, not just snapshots.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/85">Track trajectory by team, initiative, or workspace.</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-white">Canonical History</CardTitle>
                  <CardDescription className="text-white/85">Meaningful deltas with context.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/85">Cut through noise and review changes that actually impact outcomes.</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-white">Change Alerts</CardTitle>
                  <CardDescription className="text-white/85">Surface issues when they need attention.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/85">Route important shifts to owners before they become blockers.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8 scroll-mt-[77px]" id="workflow">
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge variant="secondary">Operating Loop</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                How Canon works in production.
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
                      <p className="text-sm text-white/80">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
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
              <p className="text-sm text-white/85">
                Every signal is traceable to source events so decisions stay grounded in reality.
              </p>
            </div>
            <div className="glass-panel p-8">
              <h3 className="font-display text-2xl font-semibold">Control and Governance</h3>
              <p className="mt-3 text-white/85">
                Canon supports automation where safe and human review where needed.
              </p>
              <div className="mt-6 space-y-4 text-sm">
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

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8 scroll-mt-[77px]" id="integrations">
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge variant="secondary">Integrations</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Inputs from core systems. Outputs to operating channels.
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
                    <CardTitle className="text-white">GitHub</CardTitle>
                  </div>
                  <CardDescription className="text-white/85">Code activity and delivery velocity.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/85">Track commits, PR flow, and execution trend shifts.</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/25 bg-white/5">
                      <IntegrationLogos provider="atlassian" size={24} />
                    </div>
                    <CardTitle className="text-white">Atlassian</CardTitle>
                  </div>
                  <CardDescription className="text-white/85">Workstream and ticket movement.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/85">Understand backlog flow, blockers, and completion dynamics.</p>
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
                  <p className="text-sm text-white/85">Route daily signals, weekly insights, and change alerts to the right channels.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8 scroll-mt-[77px]" id="security">
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
                <div className="rounded-xl border border-white/25 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white">
                  Connect
                  <p className="text-xs font-normal text-white/80">OAuth to GitHub / Atlassian / Slack</p>
                </div>
                <div className="rounded-xl border border-white/25 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white">
                  Canon
                  <p className="text-xs font-normal text-white/80">Encrypt tokens &rarr; ingest events &rarr; compute signals</p>
                </div>
                <div className="rounded-xl border border-white/25 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white">
                  Outputs
                  <p className="text-xs font-normal text-white/80">Daily signal, weekly insight, change alerts</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
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

      <footer className="relative border-t border-white/25">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-white/80 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© 2026 Canon</p>
          <a href="mailto:john@usecanon.com" className="transition hover:text-white">
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
