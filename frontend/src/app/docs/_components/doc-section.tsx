import { CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/components/ui/utils';

export function DocSection({
  title,
  description,
  whereToGo,
  links,
  prerequisite,
  steps,
  children,
  tip,
}: {
  title: string;
  description: string;
  whereToGo?: string;
  links?: Array<{ label: string; href: string }>;
  prerequisite?: React.ReactNode;
  steps?: Array<{ label: string; text: string; sub?: boolean }>;
  children?: React.ReactNode;
  tip?: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-2 leading-relaxed text-white/80">{description}</p>
        {whereToGo && (
          <div className="mt-4 rounded-lg border border-white/10 bg-zinc-800/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-white/50">Where To Go</p>
            <p className="mt-1 text-sm text-white/90">{whereToGo}</p>
            {links && links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/90 transition hover:bg-white/10"
                  >
                    {link.label}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {prerequisite}

      {steps && steps.length > 0 && (
        <div className="border-t border-white/10 pt-6">
          <h2 className="mb-4 text-lg font-medium text-white">Steps</h2>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className={cn('flex gap-3 text-white/85', step.sub && 'ml-8')}>
                <span
                  className={cn(
                    'flex h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white',
                    step.sub ? 'w-6 bg-white/15' : 'min-w-[1.5rem] bg-zinc-600'
                  )}
                >
                  {step.label}
                </span>
                <span className="leading-relaxed">{step.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {children}

      {tip && (
        <div className="mt-6 flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-emerald-200">Before You Move On</p>
            <p className="mt-1 text-sm text-emerald-100/90">{tip}</p>
          </div>
        </div>
      )}
    </section>
  );
}
