'use client';

import { useEffect, useState } from 'react';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCode,
  IconMessageCircle,
  IconPresentation,
  IconRadar,
  IconSend,
  IconSettings2,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReadinessBrief } from '@/types/onboarding';

const signalDefinitions = [
  { id: 'product', icon: IconSettings2, iconBg: 'var(--canon-purple-light)', iconColor: 'var(--canon-purple)', label: 'Product Changes', description: 'New Capabilities and Launch Changes' },
  { id: 'objections', icon: IconMessageCircle, iconBg: 'var(--blue-bg)', iconColor: 'var(--blue)', label: 'Customer Objections', description: 'Patterns from Calls and Field Feedback' },
  { id: 'demo', icon: IconPresentation, iconBg: 'var(--amber-bg)', iconColor: 'var(--amber)', label: 'Demo Guidance', description: 'Updated Narratives and Talk Tracks' },
  { id: 'impl', icon: IconCode, iconBg: 'var(--teal-bg)', iconColor: 'var(--teal)', label: 'Implementation Patterns', description: 'Technical Setup and Delivery Shifts' },
];

export function ReadinessClient() {
  const [brief, setBrief] = useState<ReadinessBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSignal, setActiveSignal] = useState('product');

  useEffect(() => {
    let cancelled = false;

    async function loadReadiness() {
      try {
        const res = await fetch('/api/onboarding/readiness');
        const data = (await res.json()) as { brief?: ReadinessBrief | null };
        if (!cancelled) setBrief(data.brief ?? null);
      } catch {
        if (!cancelled) setBrief(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReadiness();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
          <Skeleton className="h-8 w-44 bg-[var(--bg-primary)]" />
        </div>
        <div className="grid grid-cols-4 gap-[10px] px-6 py-[14px]">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-[10px] bg-[var(--bg-primary)]" />)}
        </div>
      </div>
    );
  }

  const signalCounts = signalDefinitions.map((signal, index) => ({
    ...signal,
    count: brief?.cards[index] ? 1 : 0,
  }));
  const coverage = brief?.affected_roles.length
    ? Math.round(brief.affected_roles.reduce((sum, role) => sum + role.progress, 0) / brief.affected_roles.length)
    : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-[18px] pb-[14px] border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
        <div>
          <div className="flex items-center gap-[10px]">
            <h1 className="text-[20px] font-medium" style={{ color: 'var(--text-primary)' }}>Readiness</h1>
            <div
              className="flex items-center gap-[5px] text-[11px] font-medium px-[9px] py-[3px] rounded-full border"
              style={{ backgroundColor: 'var(--green-bg)', color: 'var(--green-text)', borderColor: 'var(--green-border)' }}
            >
              <div className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: 'var(--green)' }} />
              Always-on
            </div>
          </div>
          <p className="text-[12px] mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>
            Keep Technical GTM Teams Current as Product and Customer Patterns Change
          </p>
        </div>
        <Button><IconSend size={14} /> Send Readiness Note</Button>
      </div>

      <div className="grid grid-cols-4 gap-[10px] px-6 py-[14px] border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
        {signalCounts.map((signal) => {
          const Icon = signal.icon;
          return (
            <div
              key={signal.id}
              onClick={() => setActiveSignal(signal.id)}
              className="rounded-[10px] px-[14px] py-3 cursor-pointer transition-all duration-[120ms] border"
              style={{
                backgroundColor: activeSignal === signal.id ? 'var(--canon-purple-light)' : 'var(--bg-primary)',
                borderColor: activeSignal === signal.id ? 'var(--canon-purple)' : 'var(--border-tertiary)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-7 h-7 rounded-[7px] flex items-center justify-center" style={{ backgroundColor: signal.iconBg, color: signal.iconColor }}>
                  <Icon size={14} />
                </div>
                <span className="text-[18px] font-medium" style={{ color: 'var(--text-primary)' }}>{signal.count}</span>
              </div>
              <div className="text-[12px] font-medium mb-[2px]" style={{ color: 'var(--text-primary)' }}>{signal.label}</div>
              <div className="text-[11px] leading-[1.4]" style={{ color: 'var(--text-tertiary)' }}>{signal.description}</div>
            </div>
          );
        })}
      </div>

      {!brief ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
          <IconRadar size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
          <div className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>No Readiness Brief Loaded</div>
          <div className="text-[12px] text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
            Load Demo Data from Settings to Populate Readiness Cards and Health Metrics.
          </div>
        </div>
      ) : (
        <div
          className="grid flex-1 gap-5 overflow-hidden px-6 py-6"
          style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 380px)' }}
        >
          <div className="min-w-0 overflow-y-auto">
            <div className="rounded-[10px] border overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
              <div className="px-4 py-[14px] border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
                <div className="text-[16px] font-medium" style={{ color: 'var(--text-primary)' }}>{brief.title}</div>
                <div className="text-[12px] mt-[2px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>{brief.subtitle}</div>
              </div>

              <div className="flex items-start gap-2 mx-4 my-3 px-3 py-[10px] rounded-[8px] border" style={{ backgroundColor: 'rgba(217,119,6,0.07)', borderColor: 'var(--amber-border)' }}>
                <IconAlertTriangle size={14} style={{ color: 'var(--amber)', marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] mb-[3px]" style={{ color: 'var(--amber-text)' }}>
                    Detected Shift
                  </div>
                  <div className="text-[12px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>{brief.detected_shift}</div>
                </div>
              </div>

              <div className="px-4 pb-4 space-y-2">
                {brief.bullets.map((item, index) => (
                  <div key={item} className="flex items-start gap-2 px-[10px] py-2 rounded-[8px]" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <div className="w-[6px] h-[6px] rounded-full mt-[5px] flex-shrink-0" style={{ backgroundColor: 'var(--canon-purple)' }} />
                    <div>
                      <div className="text-[12px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>{item}</div>
                      {index === 0 && (
                        <button className="text-[11px] flex items-center gap-[3px] mt-[3px]" style={{ color: 'var(--canon-purple)' }}>
                          <IconArrowRight size={11} /> Take Action
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 overflow-y-auto flex flex-col gap-5">
            <div className="rounded-[10px] border p-5" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>Readiness Health</div>
                  <div className="text-[12px] mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>Signal Coverage Across Active Milestones</div>
                </div>
                <div className="text-right">
                  <div className="text-[30px] font-medium leading-none" style={{ color: 'var(--text-primary)' }}>{coverage}%</div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>coverage</div>
                </div>
              </div>
              <div className="h-[6px] rounded-[3px]" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div className="h-full rounded-[3px]" style={{ width: `${coverage}%`, background: 'linear-gradient(90deg, #16a34a, #4ade80)' }} />
              </div>
              <div className="mt-4 grid gap-2">
                {brief.health_stats.map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between gap-4 rounded-[7px] px-3 py-2 text-[12px]" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <span className="leading-[1.4]" style={{ color: 'var(--text-secondary)' }}>{stat.label}</span>
                    <span className="font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[10px] border overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
                <div className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>Who Needs This</div>
                <div className="text-[12px] mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>Teams with the Largest Readiness Gap</div>
              </div>
              {brief.affected_roles.map((role) => (
                <div key={role.role} className="px-5 py-4 border-b last:border-0" style={{ borderColor: 'var(--border-tertiary)' }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="min-w-0 text-[13px] font-medium leading-[1.35]" style={{ color: 'var(--text-primary)' }}>{role.role}</span>
                    <span className="text-[10px] font-medium px-[7px] py-[3px] rounded-[4px] whitespace-nowrap" style={{ backgroundColor: 'var(--red-bg)', color: 'var(--red-text)' }}>
                      {role.impact}
                    </span>
                  </div>
                  <div className="h-[5px] rounded-[3px] mb-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <div className="h-full rounded-[2px]" style={{ width: `${role.progress}%`, backgroundColor: 'var(--canon-purple)' }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    <span>Coverage Gap</span>
                    <span className="font-medium tabular-nums">{role.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
