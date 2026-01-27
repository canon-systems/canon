'use client';

import { useState, useEffect, useMemo, useRef, startTransition } from 'react';
import { ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PromptConfig {
  personality?: string;
  style?: string;
  perspective?: string;
  audience?: string;
  customInstructions?: string;
  temperature?: number;
}

interface PromptCustomizerProps {
  promptConfig: PromptConfig;
  onChange: (config: PromptConfig) => void;
  onSave?: () => Promise<void>;
  saving?: boolean;
  saveMessage?: string;
  saveError?: string;
}

const personalityOptions = [
  { value: 'default', label: 'Default (Professional)' },
  { value: 'friendly', label: 'Friendly & Approachable' },
  { value: 'concise', label: 'Concise & Direct' },
  { value: 'detailed', label: 'Detailed & Thorough' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'formal', label: 'Formal & Academic' }
];

const styleOptions = [
  { value: 'default', label: 'Default (Technical)' },
  { value: 'beginner-friendly', label: 'Beginner-Friendly' },
  { value: 'expert-level', label: 'Expert-Level' },
  { value: 'tutorial', label: 'Tutorial Style' },
  { value: 'reference', label: 'Reference Manual' },
  { value: 'blog-post', label: 'Blog Post Style' }
];

const perspectiveOptions = [
  { value: 'default', label: 'Default (Third Person)' },
  { value: 'first-person', label: 'First Person (I/We)' },
  { value: 'second-person', label: 'Second Person (You)' },
  { value: 'third-person', label: 'Third Person (It/They)' },
  { value: 'third-person-formal', label: 'Third Person Formal' }
];

const audienceOptions = [
  { value: 'technical', label: 'Technical (Developers, Engineers)' },
  { value: 'non-technical', label: 'Non-Technical (Business, End Users)' },
  { value: 'mixed', label: 'Mixed Audience' },
  { value: 'beginner', label: 'Beginners (No Prior Knowledge)' },
  { value: 'intermediate', label: 'Intermediate (Some Experience)' },
  { value: 'expert', label: 'Expert (Advanced Users)' }
];

const temperaturePresets = [
  { value: 0.0, label: 'Deterministic (0.0)', description: 'Most consistent, same input = same output' },
  { value: 0.3, label: 'Balanced (0.3)', description: 'Recommended - creative but consistent' },
  { value: 0.7, label: 'Creative (0.7)', description: 'More varied and creative responses' },
  { value: 1.0, label: 'Very Creative (1.0)', description: 'Maximum creativity and variation' }
];

export function PromptCustomizer({ promptConfig, onChange, onSave, saving = false, saveMessage, saveError }: PromptCustomizerProps) {
  const [expanded, setExpanded] = useState(false);
  const [useCustomPersonality, setUseCustomPersonality] = useState(false);
  const [useCustomStyle, setUseCustomStyle] = useState(false);
  const [customPersonalityText, setCustomPersonalityText] = useState('');
  const [customStyleText, setCustomStyleText] = useState('');

  // Initialize defaults
  useEffect(() => {
    const config = { ...promptConfig };
    if (config.temperature === undefined) config.temperature = 0.3;
    if (!config.personality) config.personality = 'default';
    if (!config.style) config.style = 'default';
    if (!config.perspective) config.perspective = 'default';
    if (!config.audience) config.audience = 'technical';
    if (!config.customInstructions) config.customInstructions = '';
    onChange(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount to initialize defaults

  // Derive custom personality state
  const personalityOpts = useMemo(() => personalityOptions.map(o => o.value), []);
  const isCustomPersonality = useMemo(() => {
    return promptConfig.personality ? !personalityOpts.includes(promptConfig.personality) : false;
  }, [promptConfig.personality, personalityOpts]);
  
  const prevPersonalityRef = useRef(promptConfig.personality);
  useEffect(() => {
    if (prevPersonalityRef.current !== promptConfig.personality) {
      prevPersonalityRef.current = promptConfig.personality;
      startTransition(() => {
        if (isCustomPersonality && promptConfig.personality) {
          setUseCustomPersonality(true);
          setCustomPersonalityText(promptConfig.personality);
        } else if (promptConfig.personality && !isCustomPersonality && useCustomPersonality) {
          setUseCustomPersonality(false);
        }
      });
    }
  }, [promptConfig.personality, isCustomPersonality, useCustomPersonality]);

  // Derive custom style state
  const styleOpts = useMemo(() => styleOptions.map(o => o.value), []);
  const isCustomStyle = useMemo(() => {
    return promptConfig.style ? !styleOpts.includes(promptConfig.style) : false;
  }, [promptConfig.style, styleOpts]);
  
  const prevStyleRef = useRef(promptConfig.style);
  useEffect(() => {
    if (prevStyleRef.current !== promptConfig.style) {
      prevStyleRef.current = promptConfig.style;
      startTransition(() => {
        if (isCustomStyle && promptConfig.style) {
          setUseCustomStyle(true);
          setCustomStyleText(promptConfig.style);
        } else if (promptConfig.style && !isCustomStyle && useCustomStyle) {
          setUseCustomStyle(false);
        }
      });
    }
  }, [promptConfig.style, isCustomStyle, useCustomStyle]);

  const hasCustomization =
    (promptConfig.personality && promptConfig.personality !== 'default') ||
    (promptConfig.style && promptConfig.style !== 'default') ||
    (promptConfig.perspective && promptConfig.perspective !== 'default') ||
    (promptConfig.audience && promptConfig.audience !== 'technical') ||
    (promptConfig.customInstructions?.trim() || '').length > 0 ||
    (promptConfig.temperature !== undefined && promptConfig.temperature !== 0.3);

  function updateConfig(updates: Partial<PromptConfig>) {
    onChange({ ...promptConfig, ...updates });
  }

  function resetToDefault() {
    updateConfig({
      personality: 'default',
      style: 'default',
      perspective: 'default',
      audience: 'technical',
      customInstructions: '',
      temperature: 0.3
    });
    setUseCustomPersonality(false);
    setUseCustomStyle(false);
    setCustomPersonalityText('');
    setCustomStyleText('');
  }

  return (
    <div className="rounded-lg border border-white/20 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-white">Documentation Style & Personality</span>
          {hasCustomization ? (
            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">Custom</span>
          ) : (
            <span className="text-xs text-white/50">(Default settings)</span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto gap-1 text-xs text-white/70 hover:text-white"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Hide customization options' : 'Customize how the AI writes documentation'}
        >
          <span>{expanded ? 'Hide' : 'Customize'}</span>
          <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-3 w-3" />
          </span>
        </Button>
      </div>

      {/* Quick preview when collapsed */}
      {!expanded && hasCustomization && (
        <div className="mt-2 text-xs text-white/60">
          <span className="font-medium text-white/80">Active:</span>
          {promptConfig.personality && promptConfig.personality !== 'default' && (
            <>
              {personalityOptions.find(o => o.value === promptConfig.personality)?.label || promptConfig.personality}
            </>
          )}
          {promptConfig.style && promptConfig.style !== 'default' && (
            <>
              {promptConfig.personality && promptConfig.personality !== 'default' && ' • '}
              {styleOptions.find(o => o.value === promptConfig.style)?.label || promptConfig.style}
            </>
          )}
          {promptConfig.perspective && promptConfig.perspective !== 'default' && (
            <>
              {((promptConfig.personality && promptConfig.personality !== 'default') || (promptConfig.style && promptConfig.style !== 'default')) && ' • '}
              {perspectiveOptions.find(o => o.value === promptConfig.perspective)?.label || promptConfig.perspective}
            </>
          )}
          {promptConfig.audience && promptConfig.audience !== 'technical' && (
            <>
              {((promptConfig.personality && promptConfig.personality !== 'default') || (promptConfig.style && promptConfig.style !== 'default') || (promptConfig.perspective && promptConfig.perspective !== 'default')) && ' • '}
              {audienceOptions.find(o => o.value === promptConfig.audience)?.label || promptConfig.audience}
            </>
          )}
          {promptConfig.temperature !== undefined && promptConfig.temperature !== 0.3 && (
            <>
              {((promptConfig.personality && promptConfig.personality !== 'default') || (promptConfig.style && promptConfig.style !== 'default') || (promptConfig.perspective && promptConfig.perspective !== 'default') || (promptConfig.audience && promptConfig.audience !== 'technical')) && ' • '}
              Temp: {promptConfig.temperature.toFixed(1)}
            </>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Personality */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-medium text-white/70">Personality</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-2 text-xs text-purple-300 hover:text-purple-200"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setUseCustomPersonality(!useCustomPersonality);
                  if (!useCustomPersonality) {
                    updateConfig({ personality: 'default' });
                    setCustomPersonalityText('');
                  } else {
                    setCustomPersonalityText('');
                    updateConfig({ personality: '' });
                  }
                }}
              >
                {useCustomPersonality ? 'Use Preset' : 'Use Custom'}
              </Button>
            </div>
            {useCustomPersonality ? (
              <Input
                value={customPersonalityText}
                onChange={(e) => {
                  setCustomPersonalityText(e.target.value);
                  updateConfig({ personality: e.target.value });
                }}
                placeholder="e.g., 'Witty and engaging', 'Serious and authoritative', 'Casual and friendly'"
                className="w-full border-white/20 bg-white/10 text-sm text-white placeholder-white/40"
              />
            ) : (
              <Select
                value={promptConfig.personality || 'default'}
                onValueChange={(value) => updateConfig({ personality: value })}
              >
                <SelectTrigger className="w-full bg-white/5 border-white/10">
                  <SelectValue placeholder="Select personality" />
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)] bg-black/95 border-white/10 backdrop-blur-xl">
                  {personalityOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-white hover:bg-white/10 focus:bg-white/10">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="mt-1 text-xs text-white/50">Sets the tone and voice of the documentation</p>
          </div>

          {/* Writing Style */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-medium text-white/70">Writing Style</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-2 text-xs text-purple-300 hover:text-purple-200"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setUseCustomStyle(!useCustomStyle);
                  if (!useCustomStyle) {
                    updateConfig({ style: 'default' });
                    setCustomStyleText('');
                  } else {
                    setCustomStyleText('');
                    updateConfig({ style: '' });
                  }
                }}
              >
                {useCustomStyle ? 'Use Preset' : 'Use Custom'}
              </Button>
            </div>
            {useCustomStyle ? (
              <Input
                value={customStyleText}
                onChange={(e) => {
                  setCustomStyleText(e.target.value);
                  updateConfig({ style: e.target.value });
                }}
                placeholder="e.g., 'Step-by-step tutorials with screenshots', 'API reference with code samples', 'Visual diagrams and examples'"
                className="w-full border-white/20 bg-white/10 text-sm text-white placeholder-white/40"
              />
            ) : (
              <Select
                value={promptConfig.style || 'default'}
                onValueChange={(value) => updateConfig({ style: value })}
              >
                <SelectTrigger className="w-full bg-white/5 border-white/10">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)] bg-black/95 border-white/10 backdrop-blur-xl">
                  {styleOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-white hover:bg-white/10 focus:bg-white/10">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="mt-1 text-xs text-white/50">Determines the technical level and format of the documentation</p>
          </div>

          {/* Perspective */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Narrative Perspective</label>
            <Select
              value={promptConfig.perspective || 'default'}
              onValueChange={(value) => updateConfig({ perspective: value })}
            >
              <SelectTrigger className="w-full bg-white/5 border-white/10">
                <SelectValue placeholder="Select perspective" />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] bg-black/95 border-white/10 backdrop-blur-xl">
                {perspectiveOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-white hover:bg-white/10 focus:bg-white/10">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-white/50">Controls whether the documentation uses &quot;I/we&quot;, &quot;you&quot;, &quot;it/they&quot;, or formal third person</p>
          </div>

          {/* Audience */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Target Audience</label>
            <Select
              value={promptConfig.audience || 'technical'}
              onValueChange={(value) => updateConfig({ audience: value })}
            >
              <SelectTrigger className="w-full bg-white/5 border-white/10">
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] bg-black/95 border-white/10 backdrop-blur-xl">
                {audienceOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-white hover:bg-white/10 focus:bg-white/10">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-white/50">Specifies the intended audience for the documentation</p>
          </div>

          {/* Custom Instructions */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Custom Instructions (Optional)</label>
            <Textarea
              value={promptConfig.customInstructions || ''}
              onChange={(e) => updateConfig({ customInstructions: e.target.value })}
              placeholder="e.g., 'Focus on security best practices', 'Include code examples for each API endpoint', 'Use emojis sparingly'"
              rows={3}
              className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/40"
            />
            <p className="mt-1 text-xs text-white/50">Add specific instructions to customize the documentation output</p>
          </div>

          {/* Temperature */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">
              Temperature: {(promptConfig.temperature || 0.3).toFixed(1)}
            </label>
            <div className="space-y-2">
              <Input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={promptConfig.temperature || 0.3}
                onChange={(e) => updateConfig({ temperature: parseFloat(e.target.value) })}
                className="w-full accent-purple-500"
              />
              <div className="grid grid-cols-2 gap-2 text-xs">
                {temperaturePresets.map(preset => {
                  const isSelected = (promptConfig.temperature || 0.3) === preset.value;
                  return (
                    <Button
                      key={preset.value}
                      type="button"
                      variant="secondary"
                      className={`rounded-lg border px-2 py-1.5 transition-colors ${
                        isSelected
                          ? 'bg-purple-500/20 text-purple-300 border-purple-400/50'
                          : 'border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                      onClick={() => updateConfig({ temperature: preset.value })}
                    >
                      <div className="font-medium">{preset.label}</div>
                      <div className="text-xs text-white/50">{preset.description}</div>
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-white/50">Controls randomness: Lower = more consistent, Higher = more creative</p>
            </div>
          </div>

          {hasCustomization && (
            <Button
              variant="secondary"
              className="w-full border-white/20 bg-white/10 text-xs text-white/80 hover:bg-white/20"
              onClick={resetToDefault}
            >
              Reset to Default
            </Button>
          )}

          {/* Save button and messages */}
          {onSave && (
            <div className="pt-2 border-t border-white/10">
              <Button
                className="inline-flex w-full items-center justify-center gap-2 bg-purple-500/20 text-xs font-medium text-purple-200 hover:bg-purple-500/30"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Prompt Settings</span>
                )}
              </Button>
              {saveMessage && (
                <p className="mt-2 text-xs text-green-300 text-center">{saveMessage}</p>
              )}
              {saveError && (
                <p className="mt-2 text-xs text-red-300 text-center">{saveError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
