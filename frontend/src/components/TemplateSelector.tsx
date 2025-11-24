'use client';

import { useState } from 'react';
import { FileText, Loader2, ChevronDown } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description?: string;
}

interface TemplateSelectorProps {
  templates: Template[];
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
  disabled = false 
}: TemplateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async (template: Template) => {
    if (isApplying) return;

    setIsApplying(true);
    setSelectedTemplate(template);
    
    try {
      await onApply(template.id);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to apply template:', error);
    } finally {
      setIsApplying(false);
      setSelectedTemplate(null);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isApplying}
        className="inline-flex items-center gap-2 rounded-lg border border-purple-500/50 bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-200 hover:bg-purple-500/30 hover:border-purple-500/70 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
      >
        <FileText className="h-4 w-4" />
        Apply Template
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-2 w-64 rounded-lg border border-white/20 bg-black/90 backdrop-blur-md shadow-xl z-50 overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleApply(template)}
                  disabled={isApplying}
                  className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors border-b border-white/10 last:border-b-0 disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-medium text-white text-sm">
                        {template.name}
                        {selectedTemplate?.id === template.id && isApplying && (
                          <Loader2 className="h-3 w-3 animate-spin inline ml-2" />
                        )}
                      </div>
                      {template.description && (
                        <div className="text-xs text-white/60 mt-1">
                          {template.description}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

