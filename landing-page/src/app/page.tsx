import { ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function LandingPage() {
  const appHref = 'https://sync-swart.vercel.app/login';

  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.10),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />

      <header className="relative">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/web-app-manifest-512x512.png"
              alt="Canon"
              className="h-10 w-10 rounded-xl border border-white/10"
            />
            <div>
              <p className="text-base font-semibold text-white">Canon</p>
            </div>
          </div>

          <nav className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <a href={appHref} target="_blank" rel="noopener noreferrer">
                Sign In
              </a>
            </Button>
            <Button asChild>
              <a href={appHref} target="_blank" rel="noopener noreferrer">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </nav>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pb-24 lg:pt-16">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="animate-rise space-y-6">
              <Badge className="w-fit">Truth Alignment Layer</Badge>

              <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Keep Shared Understanding Aligned With Reality.
              </h1>

              <p className="text-lg leading-relaxed text-white/70">
                Canon observes what ships, detects drift, and refreshes small knowledge units. It projects the right view
                for engineering, go-to-market, customers, and system interaction diagrams—without another doc project.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" asChild>
                  <a href={appHref} target="_blank" rel="noopener noreferrer">
                    Start Aligning Knowledge
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <a href="#workflow">See the Alignment Loop</a>
                </Button>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">Reality-Linked</p>
                  <p className="mt-1 text-sm text-white/60">Every unit traces to code and behavior.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">Audience-Aware</p>
                  <p className="mt-1 text-sm text-white/60">One truth, many projections.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">Living Diagrams</p>
                  <p className="mt-1 text-sm text-white/60">System interaction diagrams refresh as dependencies change.</p>
                </div>
              </div>
            </div>

            <div className="animate-rise animate-rise-delay-1 space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                    Alignment Signal
                  </p>
                  <Badge variant="secondary">Live</Badge>
                </div>
                <Separator className="my-4" />
                <div className="space-y-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Engineering View</span>
                    <span className="font-medium text-white/80">In Sync</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Sales Enablement</span>
                    <span className="font-medium text-white/70">Review Queued</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Customer View</span>
                    <span className="font-medium text-white">Drift Detected</span>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                  Canon watches reality, not narratives. Drift gets surfaced before trust erodes.
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.01] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Projections</p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-center text-white">
                    Eng
                    <p className="text-xs text-white/60">Runbooks, Deps</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-center text-white">
                    GTM
                    <p className="text-xs text-white/60">Launch Notes</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-center text-white">
                    Customers
                    <p className="text-xs text-white/60">What Changed</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
            <div className="space-y-6">
              <Badge variant="secondary">The Drift Problem</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Systems Change Continuously. Shared Understanding Updates Manually.
              </h2>
              <p className="text-white/70">
                Reality lives in code, configs, infrastructure, and behavior. Knowledge lives in docs, pages, and tribal
                memory. Without a causal link, teams drift, explanations repeat, and trust in shared context erodes.
              </p>
            </div>
            <div className="space-y-4">
              <Card className="animate-rise animate-rise-delay-1">
                <CardHeader>
                  <CardTitle className="font-display">Reality</CardTitle>
                  <CardDescription>Code, configs, infra, and runtime behavior.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">Always Moving. Always True.</p>
                </CardContent>
              </Card>
              <Card className="animate-rise animate-rise-delay-2">
                <CardHeader>
                  <CardTitle className="font-display">Understanding</CardTitle>
                  <CardDescription>Docs, mental models, and explanations.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">Updated Episodically, If Ever.</p>
                </CardContent>
              </Card>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70">
                Drift Is Inevitable When Humans Are the Only Sensors and Synchronizers.
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8" id="workflow">
          <div className="flex flex-col gap-6">
            <div>
              <Badge variant="secondary">Canon Alignment Loop</Badge>
              <h2 className="mt-4 font-display text-2xl font-semibold sm:text-3xl">
                An Automated Knowledge Infrastructure Built for Continuous Change.
              </h2>
              <p className="mt-3 max-w-2xl text-white/70">
                Canon sits between what changes and what people believe. It observes reality, forms addressable knowledge
                units, and projects them to each audience with the right level of review.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              <Card className="animate-rise">
                <CardHeader>
                  <CardTitle className="font-display">Observe Reality</CardTitle>
                  <CardDescription>Systems of Record First, Narratives Second.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">
                    Ingest broadly by default so importance can emerge from actual usage; teams opt out, not in.
                  </p>
                </CardContent>
              </Card>
              <Card className="animate-rise animate-rise-delay-1">
                <CardHeader>
                  <CardTitle className="font-display">Addressable Units</CardTitle>
                  <CardDescription>Small, Bounded Chunks of Truth.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">
                    One unit answers one question, stays traceable, and refreshes without touching everything else.
                  </p>
                </CardContent>
              </Card>
              <Card className="animate-rise animate-rise-delay-2">
                <CardHeader>
                  <CardTitle className="font-display">Audience Projection</CardTitle>
                  <CardDescription>Same Truth, Different Views.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">
                    Engineering, sales, marketing, leadership, and customers each get the right slice of reality.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <Badge variant="secondary">Visual Flow</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                How Canon Moves From Change to Aligned Understanding.
              </h2>
              <p className="max-w-3xl text-white/70">
                One sweep: connect once, Canon tracks change, flags drift, drafts updates, and routes them where teams
                actually work.
              </p>
            </div>

            <div className="glass-panel p-6 sm:p-8">
              <div className="grid gap-4 sm:grid-cols-5">
                {[
                  {
                    title: 'Connect',
                    body: 'Sign in and choose repos/spaces.',
                    accent: 'from-cyan-400/30 via-blue-400/20 to-white/0',
                  },
                  {
                    title: 'Observe',
                    body: 'Watch diffs and updates.',
                    accent: 'from-emerald-400/30 via-teal-400/20 to-white/0',
                  },
                  {
                    title: 'Detect',
                    body: 'Spot drift as it happens.',
                    accent: 'from-amber-400/30 via-orange-400/20 to-white/0',
                  },
                  {
                    title: 'Draft',
                    body: 'Refresh small knowledge units.',
                    accent: 'from-fuchsia-400/30 via-pink-400/20 to-white/0',
                  },
                  {
                    title: 'Review & Publish',
                    body: 'Approve, then push to teams.',
                    accent: 'from-violet-400/30 via-purple-400/20 to-white/0',
                  },
                ].map((step, idx) => (
                  <div
                    key={step.title}
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_12px_50px_rgba(0,0,0,0.45)]"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${step.accent}`} aria-hidden />
                    <div className="relative flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-white/60">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] font-semibold">
                          {idx + 1}
                        </span>
                        {step.title}
                      </div>
                      <p className="text-sm text-white/80">{step.body}</p>
                      {step.title === 'Review & Publish' ? (
                        <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-medium text-white/70">
                          <span className="rounded-full border border-white/20 px-2 py-1">Eng</span>
                          <span className="rounded-full border border-white/20 px-2 py-1">GTM</span>
                          <span className="rounded-full border border-white/20 px-2 py-1">Customers</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <Badge variant="secondary">Where It Shows Up</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Canon Meets People in Their Flow, Not Just in Docs.
              </h2>
              <p className="max-w-3xl text-white/70">
                Updates arrive where work already happens—code reviews, knowledge bases, and briefings—so teams see what
                changed without hunting.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="h-full bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.01]">
                <CardHeader>
                  <CardTitle className="text-white">Code & Reviews</CardTitle>
                  <CardDescription className="text-white/70">Surface Drift Alongside Diffs and PRs.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">Stay Grounded in What Actually Shipped.</p>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-white">Knowledge Bases</CardTitle>
                  <CardDescription className="text-white/70">Push Updates Into Notion or Confluence.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">Fresh Context Where Everyone Already Looks.</p>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-white">Briefings</CardTitle>
                  <CardDescription className="text-white/70">Short Summaries for GTM and Customers.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">One Truth, Sized for Each Audience.</p>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-white">System Interaction Diagrams</CardTitle>
                  <CardDescription className="text-white/70">Maps That Redraw as Dependencies Change.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">Keep Architecture Views Trustworthy Without Manual Updates.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="glass-panel p-8">
              <h3 className="font-display text-2xl font-semibold">Audience-Aware by Design</h3>
              <p className="mt-3 text-white/70">
                Reality is singular, but understanding is audience dependent. Canon captures truth once and projects it
                differently for each group.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Badge variant="outline">Engineering</Badge>
                <Badge variant="outline">Product</Badge>
                <Badge variant="outline">Sales</Badge>
                <Badge variant="outline">Marketing</Badge>
                <Badge variant="outline">Leadership</Badge>
                <Badge variant="outline">Customers</Badge>
              </div>
              <Separator className="my-6" />
              <p className="text-sm text-white/70">
                Audience affects level of detail, review requirements, and risk tolerance. Canon adapts the projection,
                not the source of truth.
              </p>
            </div>

            <div className="glass-panel p-8">
              <h3 className="font-display text-2xl font-semibold">Review and Control Model</h3>
              <p className="mt-3 text-white/70">
                Canon does not blindly auto-update everything. It uses the right level of control for each unit.
              </p>
              <div className="mt-6 space-y-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Auto-Update</p>
                    <p className="text-white/70">Low-risk, mechanical changes.</p>
                  </div>
                  <Badge>Low Risk</Badge>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Suggest + Queue</p>
                    <p className="text-white/70">Most updates route for quick review.</p>
                  </div>
                  <Badge variant="secondary">Default</Badge>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Flag for Review</p>
                    <p className="text-white/70">High-risk or customer-facing changes.</p>
                  </div>
                  <Badge variant="outline">High Risk</Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8" id="security">
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <Badge variant="secondary">Security</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">Built to Keep Your Data Safe.</h2>
              <p className="max-w-3xl text-white/70">
                Canon aligns knowledge without overreaching access. Sign-ins stay protected, tokens stay encrypted, and
                every data pull requires an authenticated session.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="glass-panel p-6 sm:p-8">
                <h3 className="font-display text-xl font-semibold text-white">Simple Security Promises</h3>
                <ul className="mt-4 space-y-3 text-white/70">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" />
                    <span>OAuth sign-ins (GitHub, Confluence, Notion) include built-in tamper checks so tokens can’t be replayed.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" />
                    <span>Tokens are encrypted before they’re stored, so raw credentials never sit in the database.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" />
                    <span>Every connected-data request requires a valid session; unauthorized calls are rejected.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" />
                    <span>Canon only reads the repositories and spaces you explicitly connect—nothing else.</span>
                  </li>
                </ul>
              </div>

              <div className="glass-panel p-6 sm:p-8">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                  <span>How Data Flows</span>
                  <span>At a Glance</span>
                </div>
                <Separator className="my-4" />
                <div className="space-y-4">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white">
                      Connect
                      <p className="text-xs font-normal text-white/60">OAuth to GitHub / Notion / Confluence</p>
                    </div>
                    <div className="hidden h-px flex-1 bg-white/10 sm:block" />
                    <div className="text-xs uppercase tracking-[0.25em] text-white/60 sm:mr-2">Tamper Checks</div>
                  </div>
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white">
                      Canon
                      <p className="text-xs font-normal text-white/60">Encrypt tokens → Read connected sources → Draft</p>
                    </div>
                    <div className="hidden h-px flex-1 bg-white/10 sm:block" />
                    <div className="text-xs uppercase tracking-[0.25em] text-white/60 sm:mr-2">Session Required</div>
                  </div>
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white">
                      Outputs
                      <p className="text-xs font-normal text-white/60">Pages, summaries, alerts, SIDs</p>
                    </div>
                    <div className="hidden h-px flex-1 bg-white/10 sm:block" />
                    <div className="text-xs uppercase tracking-[0.25em] text-white/60 sm:mr-2">Review + Publish</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                  Stop Losing Context.
                </h2>
                <p className="mt-2 max-w-2xl text-white/70">
                  Canon keeps shared understanding aligned with reality as systems change, so every audience sees the
                  right answer when they need it.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <a href={appHref} target="_blank" rel="noopener noreferrer">
                    See Canon in Action
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <a href="mailto:sellers.e.john@gmail.com">Ask a Question</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© 2026 Canon</p>
          <a href="mailto:sellers.e.john@gmail.com" className="transition hover:text-white">
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
