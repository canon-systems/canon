'use client';

import { Github, FolderOpen, Upload, Code, ArrowRight } from 'lucide-react';
import Link from 'next/link';

type Feature = {
  icon: typeof Github;
  title: string;
  description: string;
  accent: string;
};

const inputs: Feature[] = [
  {
    icon: Github,
    title: 'GitHub repositories',
    description: 'Connect a repository (public or private) and let CodeSense map architecture, ownership, and intent in minutes.',
    accent: 'from-sky-500/40 to-blue-500/10',
  },
  {
    icon: FolderOpen,
    title: 'Targeted directories',
    description: 'Zoom in on specific packages or services to align stakeholders on just the portion that matters.',
    accent: 'from-purple-500/40 to-fuchsia-500/10',
  },
  {
    icon: Upload,
    title: 'Encrypted ZIP uploads',
    description: 'Drag-and-drop compressed workspaces for secure, air-gapped reviews with automatic cleanup.',
    accent: 'from-emerald-400/35 to-lime-400/10',
  },
  {
    icon: Code,
    title: 'Code snippets',
    description: 'Paste snippets or gists to explain intent, risks, and downstream impact without extra ceremony.',
    accent: 'from-amber-400/40 to-orange-400/10',
  },
];

const stats = [
  { label: 'Time saved per review', value: '63%' },
  { label: 'Faster stakeholder sign-off', value: '3×' },
  { label: 'Teams onboarded', value: '240+' },
];

const flowPreview = [
  {
    title: 'Choose your source',
    description: 'Link a repo, paste a directory, or drop a ZIP. Menus adapt to what you provide.',
  },
  {
    title: 'Guide the intent',
    description: 'Select the audience, highlight architectural focus, and add optional prompts.',
  },
  {
    title: 'Generate & refine',
    description: 'Get structured docs with inline diffs, edit-friendly sections, and contextual sharing.',
  },
];

const feedbackMoments = [
  {
    title: 'Autosave + diff timeline',
    description: 'Every edit captures a diff preview and timestamp so reviewers can rewind or branch off confidently.',
  },
  {
    title: 'Contextual toasts',
    description: 'Success, warning, and info toasts anchor near the component they reference, keeping attention localized.',
  },
  {
    title: 'Guided exports',
    description: 'Share PDFs, Notion pages, or Slack summaries with layouts that honor your theme tokens.',
  },
];

const heuristics = [
  {
    title: 'Progressive disclosure',
    description:
      'Primary actions are surfaced upfront while advanced controls slide in contextually, keeping focus high and noise low.',
  },
  {
    title: 'System status & trust',
    description:
      'Skeleton loaders, optimistic saves, and inline toasts explain exactly what’s happening, so people never wonder if work stuck.',
  },
  {
    title: 'Accessible by default',
    description:
      'WCAG AA color ratios, 44px touch targets, focus-visible states, and reduced-motion alternatives are built-in.',
  },
];

const experience = [
  {
    title: 'Adaptive menus',
    description:
      'Navigation pivots between discovery and execution. Auth-aware links, breadcrumbs, and contextual tabs keep people oriented.',
    bullets: ['Role and session awareness', 'Secondary tabs for in-flow actions', 'Keyboard shortcuts on primary CTA'],
  },
  {
    title: 'Composed components',
    description:
      'Cards, editors, selectors, and diff views share tokens, radii, and elevations, so the UI feels cohesive everywhere.',
    bullets: ['Glassmorphism with restraint', 'Consistent radii + spacing scale', 'Motion curves tuned to 200ms sweet spot'],
  },
  {
    title: 'Purposeful motion',
    description:
      'Micro-interactions reinforce meaning: icons glide 150ms, panels fade at 200ms, and everything obeys prefers-reduced-motion.',
    bullets: ['Easing: standard + out-quart', 'Layers stagger within 100ms', 'Motion toggles available in settings'],
  },
];

const badges = [
  'Inline validation & autosave',
  'Contextual tooltips + empty states',
  'Optimistic updates & skeleton loaders',
  'Export-ready, client-friendly summaries',
];

export function HomePageClient() {
  return (
    <div className="page-shell">
      <section className="glass-panel hero-panel">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="space-y-6">
            <span className="pill">Modernized design system · 2025 release</span>
            <h1 className="display-font text-4xl leading-tight text-white md:text-6xl">
              Document complex systems with <span className="gradient-text">quiet confidence.</span>
          </h1>
            <p className="max-w-2xl text-lg text-white/70">
              CodeSense pairs timeless typography, spacious layouts, and intuitive flows so every stakeholder can grok
              what your software does, why it matters, and how to move faster—without deciphering raw code.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="btn btn-primary" href="/submit">
                Start analyzing
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link className="btn btn-secondary" href="/documentation">
                See how it works
              </Link>
            </div>
            <div className="stat-grid">
              {stats.map((stat) => (
                <div key={stat.label} className="stat-card">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-6">
            <span className="pill">Experience flow</span>
            <div className="mt-6 space-y-4">
              {flowPreview.map((flow, index) => (
                <div key={flow.title} className="flow-step" data-step={`0${index + 1}`}>
                  <h3>{flow.title}</h3>
                  <p>{flow.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <span className="pill">Supported inputs</span>
            <h2 className="text-3xl font-semibold text-white">Menus & components tuned for real workflows</h2>
            <p className="max-w-3xl text-base text-white/70">
              Configure submissions through adaptive panels. Each option is progressive, validated in realtime, and
              anchored with helper copy so no one feels lost mid-flow.
            </p>
          </div>
          <Link className="btn btn-secondary" href="/help">
            Explore use cases
          </Link>
        </div>

        <div className="grid-auto-fit">
          {inputs.map((feature) => {
              const Icon = feature.icon;
              return (
              <article key={feature.title} className="glass-panel p-5">
                    <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.accent}`}
                >
                  <Icon className="h-6 w-6 text-white" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm text-white/70">{feature.description}</p>
              </article>
              );
            })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel p-6 space-y-5">
          <span className="pill">UX heuristics</span>
          <h2 className="text-2xl font-semibold text-white">Grounded in clarity & trust</h2>
          <div className="space-y-5">
            {heuristics.map((heuristic, index) => (
              <div key={heuristic.title} className="flex gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 text-sm text-white/70">
                  {`0${index + 1}`}
                </div>
                <div>
                  <h3 className="font-medium text-white">{heuristic.title}</h3>
                  <p className="text-sm text-white/70">{heuristic.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="badge-grid">
            {badges.map((badge) => (
              <span key={badge}>{badge}</span>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6 space-y-5">
          <span className="pill">Flow & feedback</span>
          <h2 className="text-2xl font-semibold text-white">Frictionless from import to share</h2>
          <div className="space-y-4">
            {feedbackMoments.map((flow, index) => (
              <div key={flow.title} className="flow-step" data-step={`0${index + 1}`}>
                <h3>{flow.title}</h3>
                <p>{flow.description}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-white/70">
            Motion curves respect prefers-reduced-motion. Toasts keep context, skeletons hint layout, and autosave means no
            one redoes work after a refresh.
          </p>
      </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {experience.map((item) => (
          <article key={item.title} className="glass-panel p-6 space-y-3">
            <h3 className="text-xl font-semibold text-white">{item.title}</h3>
            <p className="text-sm text-white/70">{item.description}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-white/60">
              {item.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}

