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

              <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Keep shared understanding aligned with reality.
              </h1>

              <p className="text-lg leading-relaxed text-white/70">
                Systems change continuously. Canon observes your systems of record, detects drift, and refreshes
                addressable knowledge units, then projects the right view for every audience.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" asChild>
                  <a href={appHref} target="_blank" rel="noopener noreferrer">
                    Start Aligning Knowledge
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <a href="#workflow">See the alignment loop</a>
                </Button>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">Reality-linked</p>
                  <p className="mt-1 text-sm text-white/60">Every unit traces to code and behavior.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">Audience-aware</p>
                  <p className="mt-1 text-sm text-white/60">One truth, many projections.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">In-flow</p>
                  <p className="mt-1 text-sm text-white/60">Updates land where teams already work.</p>
                </div>
              </div>
            </div>

            <div className="animate-rise animate-rise-delay-1 space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                    Alignment signal
                  </p>
                  <Badge variant="secondary">Live</Badge>
                </div>
                <Separator className="my-4" />
                <div className="space-y-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Engineering view</span>
                    <span className="font-medium text-white/80">In sync</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Sales enablement</span>
                    <span className="font-medium text-white/70">Review queued</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Customer view</span>
                    <span className="font-medium text-white">Drift detected</span>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                  Canon watches reality, not narratives. Drift gets surfaced before trust erodes.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
            <div className="space-y-6">
              <Badge variant="secondary">The drift problem</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Systems change continuously. Shared understanding updates manually.
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
                  <p className="text-sm text-white/70">Always moving. Always true.</p>
                </CardContent>
              </Card>
              <Card className="animate-rise animate-rise-delay-2">
                <CardHeader>
                  <CardTitle className="font-display">Understanding</CardTitle>
                  <CardDescription>Docs, mental models, and explanations.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">Updated episodically, if ever.</p>
                </CardContent>
              </Card>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70">
                Drift is inevitable when humans are the only sensors and synchronizers.
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8" id="workflow">
          <div className="flex flex-col gap-6">
            <div>
              <Badge variant="secondary">Canon alignment loop</Badge>
              <h2 className="mt-4 font-display text-2xl font-semibold sm:text-3xl">
                An automated knowledge infrastructure built for continuous change.
              </h2>
              <p className="mt-3 max-w-2xl text-white/70">
                Canon sits between what changes and what people believe. It observes reality, forms addressable knowledge
                units, and projects them to each audience with the right level of review.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              <Card className="animate-rise">
                <CardHeader>
                  <CardTitle className="font-display">Observe reality</CardTitle>
                  <CardDescription>Systems of record first, narratives second.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">
                    Ingest broadly by default so importance can emerge from actual usage; teams opt out, not in.
                  </p>
                </CardContent>
              </Card>
              <Card className="animate-rise animate-rise-delay-1">
                <CardHeader>
                  <CardTitle className="font-display">Addressable units</CardTitle>
                  <CardDescription>Small, bounded chunks of truth.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">
                    One unit answers one question, stays traceable, and refreshes without touching everything else.
                  </p>
                </CardContent>
              </Card>
              <Card className="animate-rise animate-rise-delay-2">
                <CardHeader>
                  <CardTitle className="font-display">Audience projection</CardTitle>
                  <CardDescription>Same truth, different views.</CardDescription>
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
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="glass-panel p-8">
              <h3 className="font-display text-2xl font-semibold">Audience-aware by design</h3>
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
              <h3 className="font-display text-2xl font-semibold">Review and control model</h3>
              <p className="mt-3 text-white/70">
                Canon does not blindly auto-update everything. It uses the right level of control for each unit.
              </p>
              <div className="mt-6 space-y-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Auto-update</p>
                    <p className="text-white/70">Low-risk, mechanical changes.</p>
                  </div>
                  <Badge>Low risk</Badge>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Suggest + queue</p>
                    <p className="text-white/70">Most updates route for quick review.</p>
                  </div>
                  <Badge variant="secondary">Default</Badge>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">Flag for review</p>
                    <p className="text-white/70">High-risk or customer-facing changes.</p>
                  </div>
                  <Badge variant="outline">High risk</Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8" id="security">
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <Badge variant="secondary">Security</Badge>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">Built to keep your data safe.</h2>
              <p className="max-w-3xl text-white/70">
                Canon aligns knowledge without overreaching access. Sign-ins stay protected, tokens stay encrypted, and
                every data pull requires an authenticated session.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="glass-panel p-6 sm:p-8">
                <h3 className="font-display text-xl font-semibold text-white">Simple security promises</h3>
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
                  <span>How data flows</span>
                  <span>At a glance</span>
                </div>
                <Separator className="my-4" />
                <div className="space-y-4">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white">
                      Connect
                      <p className="text-xs font-normal text-white/60">OAuth to GitHub / Notion / Confluence</p>
                    </div>
                    <div className="hidden h-px flex-1 bg-white/10 sm:block" />
                    <div className="text-xs uppercase tracking-[0.25em] text-white/60 sm:mr-2">Tamper checks</div>
                  </div>
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white">
                      Canon
                      <p className="text-xs font-normal text-white/60">Encrypt tokens → Read connected sources → Draft</p>
                    </div>
                    <div className="hidden h-px flex-1 bg-white/10 sm:block" />
                    <div className="text-xs uppercase tracking-[0.25em] text-white/60 sm:mr-2">Session required</div>
                  </div>
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white">
                      Outputs
                      <p className="text-xs font-normal text-white/60">Pages, summaries, alerts</p>
                    </div>
                    <div className="hidden h-px flex-1 bg-white/10 sm:block" />
                    <div className="text-xs uppercase tracking-[0.25em] text-white/60 sm:mr-2">Review + publish</div>
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
                  Stop losing context.
                </h2>
                <p className="mt-2 max-w-2xl text-white/70">
                  Canon keeps shared understanding aligned with reality as systems change, so every audience sees the
                  right answer when they need it.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <a href={appHref} target="_blank" rel="noopener noreferrer">
                    See Canon in action
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
