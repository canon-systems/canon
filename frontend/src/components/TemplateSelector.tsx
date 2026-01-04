'use client';

import { useState } from 'react';
import { FileText, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Template {
  id: string;
  name: string;
  description?: string;
}

interface TemplateSelectorProps {
  templates?: Template[];
  onApply: (templateId: string) => Promise<void>;
  disabled?: boolean;
}

const predefinedTemplates: Template[] = [
  { id: 'standard', name: 'Standard Documentation', description: 'Standard structure with overview, setup, and API sections' },
  { id: 'api', name: 'API Documentation', description: 'Focused on API endpoints and usage' },
  { id: 'readme', name: 'README Format', description: 'GitHub-style README structure' },
  { id: 'tutorial', name: 'Tutorial Format', description: 'Step-by-step tutorial format' }
];

export function TemplateSelector({
  templates = predefinedTemplates,
  onApply,
  disabled = false,
}: TemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async (template: Template) => {
    if (isApplying) return;

    setIsApplying(true);
    setSelectedTemplate(template);

    try {
      await onApply(template.id);
    } catch (error) {
      console.error('Failed to apply template:', error);
    } finally {
      setIsApplying(false);
      setSelectedTemplate(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || isApplying}
          className="inline-flex items-center gap-2 border border-white/10 bg-white/5 text-purple-100 hover:border-white/20 hover:bg-white/10"
        >
          <FileText className="h-4 w-4" />
          Apply Template
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 border-white/10 bg-black/90 backdrop-blur-xl">
        {templates.map((template) => (
          <DropdownMenuItem
            key={template.id}
            className="flex flex-col items-start gap-1 py-3"
            disabled={isApplying}
            onSelect={(event) => {
              event.preventDefault();
              handleApply(template);
            }}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-medium text-white">{template.name}</span>
              {selectedTemplate?.id === template.id && isApplying && (
                <Loader2 className="h-3 w-3 animate-spin text-white/70" />
              )}
            </div>
            {template.description && (
              <p className="text-xs text-white/60">{template.description}</p>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
