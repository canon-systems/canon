'use client';

import { useState } from 'react';
import { Plus, X, GripVertical, FileText, Sparkles, Layers, BookOpen, Loader2 } from 'lucide-react';

export interface DocumentSection {
  id: string;
  title: string;
  description?: string;
  required: boolean;
}

export interface DocumentStructureConfig {
  sections: DocumentSection[];
  includeTableOfContents: boolean;
  customStructure?: string;
}

interface DocumentStructureProps {
  config: DocumentStructureConfig;
  onChange: (config: DocumentStructureConfig) => void;
  onSave?: () => Promise<void>;
  saving?: boolean;
  saveMessage?: string;
  saveError?: string;
}

const defaultSections: DocumentSection[] = [
  { id: 'overview', title: 'Overview', description: 'High-level introduction and purpose', required: true },
  { id: 'setup', title: 'Setup & Installation', description: 'How to get started', required: false },
  { id: 'usage', title: 'Usage', description: 'How to use the system', required: false },
  { id: 'api', title: 'API Reference', description: 'API endpoints and methods', required: false },
  { id: 'examples', title: 'Examples', description: 'Code examples and use cases', required: false },
  { id: 'troubleshooting', title: 'Troubleshooting', description: 'Common issues and solutions', required: false },
];

export function DocumentStructure({ config, onChange, onSave, saving = false, saveMessage, saveError }: DocumentStructureProps) {
  const [expanded, setExpanded] = useState(false);
  const [, setDraggedIndex] = useState<number | null>(null);
  const [activePreset, setActivePreset] = useState<'minimal' | 'default' | 'comprehensive' | null>(null);

  const hasCustomStructure = config.sections.length > 0 || config.customStructure;

  function addSection() {
    const newSection: DocumentSection = {
      id: `section-${Date.now()}`,
      title: 'New Section',
      description: '',
      required: false,
    };
    onChange({
      ...config,
      sections: [...config.sections, newSection],
    });
  }

  function removeSection(id: string) {
    onChange({
      ...config,
      sections: config.sections.filter(s => s.id !== id),
    });
  }

  function updateSection(id: string, updates: Partial<DocumentSection>) {
    onChange({
      ...config,
      sections: config.sections.map(s => s.id === id ? { ...s, ...updates } : s),
    });
  }

  function toggleRequired(id: string) {
    updateSection(id, { required: !config.sections.find(s => s.id === id)?.required });
  }

  function usePreset(preset: 'default' | 'minimal' | 'comprehensive') {
    let sections: DocumentSection[] = [];
    
    switch (preset) {
      case 'minimal':
        sections = [
          { id: 'overview', title: 'Overview', required: true },
          { id: 'usage', title: 'Usage', required: false },
        ];
        break;
      case 'comprehensive':
        sections = defaultSections;
        break;
      case 'default':
      default:
        sections = [
          { id: 'overview', title: 'Overview', required: true },
          { id: 'setup', title: 'Setup & Installation', required: false },
          { id: 'usage', title: 'Usage', required: false },
          { id: 'api', title: 'API Reference', required: false },
        ];
        break;
    }
    
    setActivePreset(preset);
    onChange({
      ...config,
      sections,
      customStructure: undefined,
    });
  }

  return (
    <div className="rounded-lg border border-white/20 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-white">Document Structure</span>
          {hasCustomStructure ? (
            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">
              {config.sections.length} section{config.sections.length !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-xs text-white/50">(Default structure)</span>
          )}
        </div>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-white/60 hover:text-white/80 transition-colors"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Hide structure options' : 'Customize document structure'}
        >
          <span>{expanded ? 'Hide' : 'Customize'}</span>
          <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            <Plus className="h-3 w-3" />
          </span>
        </button>
      </div>

      {/* Quick preview when collapsed */}
      {!expanded && hasCustomStructure && (
        <div className="mt-2 text-xs text-white/60">
          <span className="font-medium text-white/80">Sections:</span>{' '}
          {config.sections.map((s, idx) => (
            <span key={s.id}>
              {idx > 0 && ' • '}
              {s.title}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Preset Options */}
          <div>
            <label className="mb-3 block text-xs font-medium text-white/80 uppercase tracking-wide">Quick Presets</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => usePreset('minimal')}
                className={`group relative flex flex-col items-center gap-2 rounded-lg border-2 px-4 py-3 transition-all duration-200 ${
                  activePreset === 'minimal'
                    ? 'border-blue-400/60 bg-blue-500/20 shadow-lg shadow-blue-500/10'
                    : 'border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/10'
                }`}
              >
                <Sparkles className={`h-4 w-4 transition-colors ${
                  activePreset === 'minimal' ? 'text-blue-300' : 'text-white/50 group-hover:text-white/70'
                }`} />
                <span className={`text-xs font-medium transition-colors ${
                  activePreset === 'minimal' ? 'text-blue-200' : 'text-white/70 group-hover:text-white'
                }`}>
                  Minimal
                </span>
                {activePreset === 'minimal' && (
                  <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-400"></div>
                )}
              </button>
              <button
                type="button"
                onClick={() => usePreset('default')}
                className={`group relative flex flex-col items-center gap-2 rounded-lg border-2 px-4 py-3 transition-all duration-200 ${
                  activePreset === 'default'
                    ? 'border-purple-400/60 bg-purple-500/20 shadow-lg shadow-purple-500/10'
                    : 'border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/10'
                }`}
              >
                <Layers className={`h-4 w-4 transition-colors ${
                  activePreset === 'default' ? 'text-purple-300' : 'text-white/50 group-hover:text-white/70'
                }`} />
                <span className={`text-xs font-medium transition-colors ${
                  activePreset === 'default' ? 'text-purple-200' : 'text-white/70 group-hover:text-white'
                }`}>
                  Default
                </span>
                {activePreset === 'default' && (
                  <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-purple-400"></div>
                )}
              </button>
              <button
                type="button"
                onClick={() => usePreset('comprehensive')}
                className={`group relative flex flex-col items-center gap-2 rounded-lg border-2 px-4 py-3 transition-all duration-200 ${
                  activePreset === 'comprehensive'
                    ? 'border-green-400/60 bg-green-500/20 shadow-lg shadow-green-500/10'
                    : 'border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/10'
                }`}
              >
                <BookOpen className={`h-4 w-4 transition-colors ${
                  activePreset === 'comprehensive' ? 'text-green-300' : 'text-white/50 group-hover:text-white/70'
                }`} />
                <span className={`text-xs font-medium transition-colors ${
                  activePreset === 'comprehensive' ? 'text-green-200' : 'text-white/70 group-hover:text-white'
                }`}>
                  Comprehensive
                </span>
                {activePreset === 'comprehensive' && (
                  <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-400"></div>
                )}
              </button>
            </div>
          </div>

          {/* Table of Contents Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-white/20 bg-white/5 px-3 py-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-white/90">Include Table of Contents</label>
              <p className="text-xs text-white/50">Add a TOC at the beginning of the document</p>
            </div>
            <button
              type="button"
              onClick={() => onChange({ ...config, includeTableOfContents: !config.includeTableOfContents })}
              className={`toggle-switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-black`}
              role="switch"
              aria-checked={config.includeTableOfContents}
              aria-label="Include Table of Contents"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                  config.includeTableOfContents ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Custom Sections */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="block text-xs font-medium text-white/80 uppercase tracking-wide">
                Sections ({config.sections.length})
              </label>
              <button
                type="button"
                onClick={addSection}
                className="flex items-center gap-2 rounded-lg border-2 border-blue-400/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-200 transition-all hover:border-blue-400/60 hover:bg-blue-500/20 hover:shadow-lg hover:shadow-blue-500/10"
              >
                <Plus className="h-3.5 w-3.5" />
                New Section
              </button>
            </div>

            {config.sections.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-white/10 bg-white/5 p-6 text-center">
                <FileText className="mx-auto h-8 w-8 text-white/30 mb-2" />
                <p className="text-xs text-white/50">No sections defined.</p>
                <p className="text-xs text-white/40 mt-1">Add sections to structure your documentation.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {config.sections.map((section, index) => (
                  <div
                    key={section.id}
                    className="group relative flex items-start gap-3 rounded-lg border-2 border-white/20 bg-gradient-to-br from-white/5 to-white/[0.02] p-4 shadow-sm hover:border-white/30 hover:bg-white/10 hover:shadow-md transition-all duration-200"
                  >
                    <button
                      type="button"
                      className="mt-1.5 flex-shrink-0 text-white/30 hover:text-white/60 transition-colors cursor-move active:cursor-grabbing"
                      onMouseDown={() => setDraggedIndex(index)}
                      onMouseUp={() => setDraggedIndex(null)}
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-5 w-5" />
                    </button>
                    
                    <div className="flex-1 space-y-3 min-w-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={section.title}
                          onChange={(e) => updateSection(section.id, { title: e.target.value })}
                          placeholder="Section title"
                          className="flex-1 rounded-lg border-2 border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white placeholder-white/40 outline-none transition-all focus:border-blue-400/50 focus:bg-white/15 focus:ring-2 focus:ring-blue-500/20"
                        />
                        <button
                          type="button"
                          onClick={() => toggleRequired(section.id)}
                          className={`flex-shrink-0 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all ${
                            section.required
                              ? 'border-green-400/50 bg-green-500/20 text-green-200 shadow-sm shadow-green-500/10'
                              : 'border-white/20 bg-white/10 text-white/60 hover:border-white/30 hover:bg-white/15 hover:text-white/80'
                          }`}
                          title={section.required ? 'Required section' : 'Optional section'}
                        >
                          {section.required ? 'Required' : 'Optional'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSection(section.id)}
                          className="flex-shrink-0 rounded-lg p-2 text-white/40 transition-all hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/30 border-2 border-transparent"
                          title="Remove section"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={section.description || ''}
                        onChange={(e) => updateSection(section.id, { description: e.target.value })}
                        placeholder="Section description (optional)"
                        className="w-full rounded-lg border-2 border-white/20 bg-white/10 px-3 py-2 text-xs text-white/80 placeholder-white/40 outline-none transition-all focus:border-blue-400/50 focus:bg-white/15 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom Structure Instructions */}
          <div className="rounded-lg border-2 border-white/20 bg-gradient-to-br from-white/5 to-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-400" />
              <label className="block text-xs font-medium text-white/80 uppercase tracking-wide">
                Custom Structure Instructions
              </label>
              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">Optional</span>
            </div>
            <textarea
              value={config.customStructure || ''}
              onChange={(e) => onChange({ ...config, customStructure: e.target.value })}
              placeholder="e.g., 'Start with a quick start guide, then detailed API docs, end with troubleshooting'"
              rows={3}
              className="w-full rounded-lg border-2 border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder-white/40 outline-none transition-all focus:border-purple-400/50 focus:bg-white/15 focus:ring-2 focus:ring-purple-500/20 resize-none"
            />
            <p className="mt-2 text-xs text-white/50 leading-relaxed">
              Provide additional instructions for how sections should be organized and structured in the documentation.
            </p>
          </div>

          {hasCustomStructure && (
            <button
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/20"
              onClick={() => onChange({ sections: [], includeTableOfContents: false, customStructure: undefined })}
            >
              Clear Structure
            </button>
          )}
        </div>
      )}

      {/* Save Controls */}
      {onSave && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {saveMessage && (
                <div className="text-xs text-green-300">{saveMessage}</div>
              )}
              {saveError && (
                <div className="text-xs text-red-300">{saveError}</div>
              )}
            </div>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Structure'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

