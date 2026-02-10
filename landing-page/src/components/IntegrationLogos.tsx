'use client';

import * as simpleIcons from 'simple-icons';
import { cn } from '@/lib/utils';

interface IntegrationLogosProps {
  size?: number;
  provider: 'notion' | 'atlassian' | 'github';
  className?: string;
}

// Map provider names to simple-icons export names
const iconMap: Record<string, keyof typeof simpleIcons> = {
  notion: 'siNotion',
  atlassian: 'siAtlassian',
  github: 'siGithub',
};

export function IntegrationLogos({ size = 24, provider, className }: IntegrationLogosProps) {
  const iconKey = iconMap[provider] || 'siNotion';
  const icon = simpleIcons[iconKey] as { title: string; hex: string; path: string };

  if (!icon) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={icon.title}
      className={cn('text-white', className)}
    >
      <title>{icon.title}</title>
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}
