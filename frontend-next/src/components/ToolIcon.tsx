'use client';

import * as simpleIcons from 'simple-icons';

interface ToolIconProps {
  toolName: string;
  size?: number;
  className?: string;
}

// Map tool names to simple-icons export names
// Format: tool name -> simple-icons key (e.g., 'github' -> 'siGithub)
const iconMap: Record<string, keyof typeof simpleIcons> = {
  'github': 'siGithub',
  'vercel': 'siVercel',
  'react': 'siReact',
  'nextjs': 'siNextdotjs',
  'next': 'siNextdotjs',
  'nodejs': 'siNodedotjs',
  'node': 'siNodedotjs',
  'typescript': 'siTypescript',
  'javascript': 'siJavascript',
  'tailwindcss': 'siTailwindcss',
  'tailwind': 'siTailwindcss',
  'vite': 'siVite',
  'supabase': 'siSupabase',
  'docker': 'siDocker',
  'kubernetes': 'siKubernetes',
  'k8s': 'siKubernetes',
  'aws': 'siAmazonaws',
  'azure': 'siMicrosoftazure',
  'gcp': 'siGooglecloud',
  'mongodb': 'siMongodb',
  'postgresql': 'siPostgresql',
  'postgres': 'siPostgresql',
  'mysql': 'siMysql',
  'redis': 'siRedis',
  'python': 'siPython',
  'express': 'siExpress',
  'sveltekit': 'siSvelte',
  'svelte': 'siSvelte',
  // Note: tiptap, marked, turndown may not have simple-icons - will fallback to placeholder
};

export function ToolIcon({ toolName, size = 24, className = '' }: ToolIconProps) {
  // Normalize tool name (lowercase, handle variations)
  const normalizedName = toolName.toLowerCase().trim();
  const cleanName = normalizedName.replace(/[^a-z0-9]/g, '');
  
  // Try exact match first
  let iconKey = iconMap[normalizedName] || iconMap[cleanName];
  
  // If no exact match, try to find by partial match in iconMap
  if (!iconKey) {
    for (const [key, value] of Object.entries(iconMap)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        iconKey = value;
        break;
      }
    }
  }
  
  // If still no match, try to find in simple-icons by name
  if (!iconKey) {
    // Try to construct the simple-icons key (e.g., 'tailwindcss' -> 'siTailwindcss')
    const possibleKey = `si${cleanName.charAt(0).toUpperCase()}${cleanName.slice(1)}` as keyof typeof simpleIcons;
    if (simpleIcons[possibleKey]) {
      iconKey = possibleKey;
    } else {
      // Try searching for partial matches
      const searchTerm = cleanName.replace(/css|js|ts|jsx|tsx/g, '');
      const possibleKeys = Object.keys(simpleIcons).filter(key => {
        const keyName = key.toLowerCase().replace('si', '').replace(/dot/g, '.');
        return keyName.includes(searchTerm) || searchTerm.includes(keyName);
      });
      if (possibleKeys.length > 0) {
        iconKey = possibleKeys[0] as keyof typeof simpleIcons;
      }
    }
  }
  
  // Fallback to a default icon if not found
  if (!iconKey || !simpleIcons[iconKey]) {
    // Return a default placeholder
    return (
      <div 
        className={`flex items-center justify-center rounded bg-white/10 ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-xs">📦</span>
      </div>
    );
  }
  
  const icon = simpleIcons[iconKey] as { title: string; hex: string; path: string };
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      title={icon.title}
      className={className}
    >
      <path d={icon.path} fill={`#${icon.hex}`} />
    </svg>
  );
}

