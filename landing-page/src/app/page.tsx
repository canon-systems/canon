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
              <p className="text-xs text-white/60">Automated Knowledge Infrastructure</p>
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
          <div>
            <Badge className="mb-6">Less drift. More shared context.</Badge>

            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              An automated knowledge layer
              <span className="block text-white/60">that keeps pace with your code.</span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-white/70">
              Canon connects to your repositories, watches change, and drafts the missing context your team depends on —
              service pages, runbooks, system maps, and decision notes. You review what matters, and the knowledge stays
              current without a separate doc project.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" asChild>
                <a href={appHref} target="_blank" rel="noopener noreferrer">
                  Connect a Repository
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <a href="#workflow">See the workflow</a>
              </Button>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-medium text-white">Grounded</p>
                <p className="mt-1 text-sm text-white/60">Links back to diffs and owners.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-medium text-white">Current</p>
                <p className="mt-1 text-sm text-white/60">Updates follow code changes.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-medium text-white">Reviewable</p>
                <p className="mt-1 text-sm text-white/60">You approve what is canonical.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8" id="workflow">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">How Canon keeps knowledge alive</h2>
              <p className="mt-4 text-white/70">
                Canon is the layer between what engineers do and what everyone needs to know. It captures context at the
                moment of change and keeps it tied to the source.
              </p>
              <div className="mt-6 space-y-4 text-sm text-white/70">
                <p>1. Watch file changes.</p>
                <p>2. Draft updates in plain language, linked to code.</p>
                <p>3. Route changes for review, then publish where your team works.</p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Service pages</CardTitle>
                  <CardDescription>Owners, health, dependencies, and how to operate.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">
                    Every page stays linked to code paths and on-call rotations so it stays trustworthy.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Runbooks</CardTitle>
                  <CardDescription>Step-by-step guidance that matches reality.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">
                    Canon updates checks and playbooks as systems evolve, before incidents happen.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>System maps</CardTitle>
                  <CardDescription>Views that reflect how services interact.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">
                    Dependency views stay in sync without anyone redrawing diagrams.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Change narratives</CardTitle>
                  <CardDescription>Decisions captured while they’re fresh.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">
                    Summaries connect the “why” behind a change to the “what” in the repo.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white sm:text-3xl">Stop losing context</h2>
                <p className="mt-2 max-w-2xl text-white/70">
                  Start small: connect a repo and let Canon draft the first pages your team will reuse.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <a href={appHref} target="_blank" rel="noopener noreferrer">
                    Get Started
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
          <p>© 2025 Canon</p>
          <a href="mailto:sellers.e.john@gmail.com" className="transition hover:text-white">
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
