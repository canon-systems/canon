'use client';

import * as simpleIcons from 'simple-icons';

interface IntegrationLogosProps {
  size?: number;
  provider: 'notion' | 'slack' | 'confluence' | 'atlassian' | 'jira' | 'github' | 'coda';
  color?: string;
}

// Map provider names to simple-icons export names
const iconMap: Record<string, keyof typeof simpleIcons> = {
  'notion': 'siNotion',
  'slack': 'siSlack',
  'confluence': 'siConfluence',
  'atlassian': 'siAtlassian',
  'jira': 'siJira',
  'github': 'siGithub',
  'coda': 'siCoda'
};

export function IntegrationLogos({ size = 24, provider, color }: IntegrationLogosProps) {
  const iconKey = iconMap[provider] || 'siNotion';
  const icon = simpleIcons[iconKey] as { title: string; hex: string; path: string };
  const fill = color || `#${icon.hex}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={icon.title}
    >
      <title>{icon.title}</title>
      <path d={icon.path} fill={fill} />
    </svg>
  );
}
