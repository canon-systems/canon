'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, X, ArrowLeft, ChevronDown, Check, RefreshCw, Settings, Eye, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PromptCustomizer } from '@/components/PromptCustomizer';
import { RegeneratePreview } from '@/components/RegeneratePreview';
import { DocumentStructure, type DocumentStructureConfig } from '@/components/DocumentStructure';

interface Submission {
  id: string;
  title: string;
  markdown: string;
  source_meta?: any;
}

interface RegeneratePageClientProps {
  submission: Submission;
}

interface Model {
  value: string;
  label: string;
  provider: string;
  cost: string;
  context: string;
  description: string;
}

const availableModels: Model[] = [
  // OpenAI Models
  {
    value: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    cost: '$$$$',
    context: '128K tokens',
    description: 'Our most advanced, multimodal flagship model that\'s faster and 50% cheaper than GPT-4 Turbo. GPT-4o ("o" for "omni") is trained across text, vision, and audio.'
  },
  {
    value: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
    cost: '$',
    context: '128K tokens',
    description: 'A smaller, more affordable variant of GPT-4o. Fast, intelligent, and cost-effective for most tasks.'
  },
  {
    value: 'gpt-4-turbo',
    label: 'GPT-4 Turbo',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '128K tokens',
    description: 'A large multimodal model (accepting text or image inputs and outputting text) that can solve complex tasks with greater accuracy than any of our previous models.'
  },
  {
    value: 'gpt-4',
    label: 'GPT-4',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '8K tokens',
    description: 'A large multimodal model (accepting text or image inputs and outputting text) that can solve difficult problems with greater accuracy than any of our previous models.'
  },
  {
    value: 'gpt-3.5-turbo',
    label: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    cost: '$',
    context: '16K tokens',
    description: 'A high-performance, cost-effective model optimized for chat and text completion tasks. Fast and efficient for most use cases.'
  },
  {
    value: 'o1-preview',
    label: 'O1 Preview',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '128K tokens',
    description: 'Advanced reasoning model optimized for complex problem-solving and deep analysis. Uses a different architecture focused on reasoning capabilities.'
  },
  {
    value: 'o1-mini',
    label: 'O1 Mini',
    provider: 'OpenAI',
    cost: '$$$',
    context: '128K tokens',
    description: 'A smaller, more affordable version of O1. Optimized for reasoning tasks with improved cost efficiency.'
  },
  // Anthropic Models
  {
    value: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    cost: '$$$$',
    context: '200K tokens',
    description: 'Our most intelligent model, with improved performance on coding tasks, math, and following complex, multi-step instructions. Excels at nuanced content creation and sophisticated Q&A.'
  },
  {
    value: 'claude-3-opus-20240229',
    label: 'Claude 3 Opus',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Our most powerful model for highly complex tasks. Best for tasks that require deep analysis, complex content creation, code generation, and research.'
  },
  {
    value: 'claude-3-sonnet-20240229',
    label: 'Claude 3 Sonnet',
    provider: 'Anthropic',
    cost: '$$$',
    context: '200K tokens',
    description: 'A balanced model for enterprise workloads. Ideal for tasks requiring rapid responses, like knowledge retrieval or sales automation.'
  },
  {
    value: 'claude-3-haiku-20240307',
    label: 'Claude 3 Haiku',
    provider: 'Anthropic',
    cost: '$',
    context: '200K tokens',
    description: 'Our fastest and most compact model for near-instant responsiveness. Perfect for simple queries, lightweight tasks, and high-volume use cases.'
  },
  {
    value: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    cost: '$$',
    context: '200K tokens',
    description: 'An improved version of Haiku with better performance while maintaining speed and cost efficiency. Great for general-purpose tasks.'
  },
  // Google Models
  {
    value: 'gemini-2.0-flash-exp',
    label: 'Gemini 2.0 Flash (Experimental)',
    provider: 'Google',
    cost: '$$',
    context: '1M tokens',
    description: 'Experimental model with massive 1M token context window. Supports text, vision, audio, and function calling. Optimized for speed and efficiency.'
  },
  {
    value: 'gemini-1.5-pro',
    label: 'Gemini 1.5 Pro',
    provider: 'Google',
    cost: '$$$$',
    context: '2M tokens',
    description: 'Google\'s most capable model with an enormous 2M token context window. Excellent for complex reasoning, code generation, and multimodal tasks.'
  },
  {
    value: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    provider: 'Google',
    cost: '$$',
    context: '1M tokens',
    description: 'Fast and efficient model with 1M token context window. Great balance of speed, cost, and capability for most use cases.'
  },
  {
    value: 'gemini-1.5-flash-8b',
    label: 'Gemini 1.5 Flash 8B',
    provider: 'Google',
    cost: '$',
    context: '1M tokens',
    description: 'Lightweight 8B parameter model with 1M token context. Ultra-fast and cost-effective for simple tasks.'
  }
];

export function RegeneratePageClient({ submission }: RegeneratePageClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const regenModelDropdownRef = useRef<HTMLDivElement>(null);

  const [currentStep, setCurrentStep] = useState<'config' | 'preview'>('config');
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewModel, setPreviewModel] = useState('');
  const [previewPromptConfig, setPreviewPromptConfig] = useState<any>({});
  const [previewError, setPreviewError] = useState('');
  const [selectedRegenModel, setSelectedRegenModel] = useState(submission.source_meta?.model || 'gpt-4o');
  const [regenPromptConfig, setRegenPromptConfig] = useState(
    submission.source_meta?.llm_prompt_config || {
      personality: 'default',
      style: 'default',
      audience: 'technical',
      customInstructions: '',
      temperature: 0.3
    }
  );
  const [structureConfig, setStructureConfig] = useState<DocumentStructureConfig>(
    submission.source_meta?.document_structure || {
      sections: [],
      includeTableOfContents: false,
    }
  );
  const [showRegenModelDropdown, setShowRegenModelDropdown] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const selectedRegenModelObj = availableModels.find(m => m.value === selectedRegenModel) || availableModels[0];

  // Click outside handler for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showRegenModelDropdown &&
        regenModelDropdownRef.current &&
        !regenModelDropdownRef.current.contains(event.target as Node)
      ) {
        setShowRegenModelDropdown(false);
      }
    }
    if (showRegenModelDropdown) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showRegenModelDropdown]);

  async function generatePreview() {
    setGeneratingPreview(true);
    setPreviewError('');
    setPreviewContent('');

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        throw new Error('No authenticated user available');
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('No session token available');
      }

      const res = await fetch('/api/docs/generate-preview', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          submissionId: submission.id,
          model: selectedRegenModel,
          promptConfig: {
            ...regenPromptConfig,
            document_structure: structureConfig
          }
        })
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result?.error || result?.detail || `Preview generation failed (${res.status})`);
      }

      setPreviewContent(result.markdown || '');
      setPreviewModel(result.model || selectedRegenModel);
      setPreviewPromptConfig(result.promptConfig || regenPromptConfig);
      setCurrentStep('preview');
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setGeneratingPreview(false);
    }
  }

  async function applyPreviewChanges() {
    setRegenerating(true);
    setPreviewError('');

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        throw new Error('No authenticated user available');
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('No session token available');
      }

      const res = await fetch('/api/docs/update', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          submissionId: submission.id,
          previewContent: previewContent
        })
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result?.error || result?.detail || `Update failed (${res.status})`);
      }

      // Redirect back to edit page after successful update
      router.push(`/edit/${submission.id}`);
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-4">
            <Link
              href={`/edit/${submission.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Editor
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 p-3 border border-purple-500/30">
              <RefreshCw className="h-6 w-6 text-purple-300" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Regenerate Documentation</h1>
              <p className="text-white/60 mt-1">Update your documentation with new AI-generated content</p>
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="mb-6 flex items-center gap-4">
          <div className={`flex items-center gap-2 ${currentStep === 'config' ? 'text-white' : 'text-white/40'}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
              currentStep === 'config' 
                ? 'border-purple-500 bg-purple-500/20 text-purple-300' 
                : 'border-white/30 bg-white/5 text-white/40'
            }`}>
              {currentStep === 'config' ? (
                <Settings className="h-5 w-5" />
              ) : (
                <Check className="h-5 w-5" />
              )}
            </div>
            <span className="font-medium">Configure</span>
          </div>
          <div className="h-px flex-1 bg-white/20" />
          <div className={`flex items-center gap-2 ${currentStep === 'preview' ? 'text-white' : 'text-white/40'}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
              currentStep === 'preview' 
                ? 'border-purple-500 bg-purple-500/20 text-purple-300' 
                : 'border-white/30 bg-white/5 text-white/40'
            }`}>
              <Eye className="h-5 w-5" />
            </div>
            <span className="font-medium">Preview</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="rounded-xl border border-white/20 bg-black/90 p-8 shadow-xl backdrop-blur-md">
          {currentStep === 'config' ? (
            /* Configuration Step */
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">Configuration</h2>
                <p className="text-sm text-white/60">
                  Choose your AI model and customize the prompt settings to regenerate your documentation.
                </p>
              </div>

              {/* Model Selection */}
              <div>
                <label className="mb-3 block text-sm font-semibold text-white/90">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    AI Model
                  </span>
                </label>
                <div className="relative" ref={regenModelDropdownRef}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-white outline-none focus:border-white/40 focus:ring-2 focus:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => setShowRegenModelDropdown(!showRegenModelDropdown)}
                    disabled={generatingPreview}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{selectedRegenModelObj.label}</span>
                      <span className="text-xs text-white/60">({selectedRegenModelObj.provider})</span>
                      <span className="text-xs text-yellow-400">{selectedRegenModelObj.cost}</span>
                      <span className="text-xs text-blue-400">{selectedRegenModelObj.context}</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-white/60 transition-transform ${showRegenModelDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showRegenModelDropdown && (
                    <div className="absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-lg border border-white/20 bg-gray-900 shadow-xl">
                      {availableModels.map(model => (
                        <button
                          key={model.value}
                          type="button"
                          className={`w-full px-4 py-3 text-left transition-colors hover:bg-white/10 focus:bg-white/10 focus:outline-none ${
                            selectedRegenModel === model.value ? 'bg-white/15' : ''
                          }`}
                          onClick={() => {
                            setSelectedRegenModel(model.value);
                            setShowRegenModelDropdown(false);
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-white">{model.label}</span>
                                {model.provider && <span className="text-xs text-white/60">({model.provider})</span>}
                                {model.cost && <span className="text-xs font-medium text-yellow-400">{model.cost}</span>}
                                {model.context && <span className="text-xs font-medium text-blue-400">{model.context}</span>}
                              </div>
                              {model.description && (
                                <p className="text-xs leading-relaxed text-white/70">{model.description}</p>
                              )}
                            </div>
                            {selectedRegenModel === model.value && (
                              <Check className="h-5 w-5 shrink-0 text-green-400" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Prompt Customization */}
              <div className="space-y-4">
                <PromptCustomizer promptConfig={regenPromptConfig} onChange={setRegenPromptConfig} />
                <DocumentStructure config={structureConfig} onChange={setStructureConfig} />
              </div>

              {/* Error Message */}
              {previewError && (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
                  {previewError}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between items-center pt-6 border-t border-white/10">
                <Link
                  href={`/edit/${submission.id}`}
                  className="rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </Link>
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-2.5 text-sm font-semibold text-white hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
                  onClick={generatePreview}
                  disabled={generatingPreview}
                >
                  {generatingPreview ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating Preview...
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      Generate Preview
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Preview Step */
            <div className="space-y-6">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">Preview Changes</h2>
                  <p className="text-sm text-white/60">
                    Generated with <strong className="text-white/90">{previewModel}</strong>
                    {previewPromptConfig.personality && previewPromptConfig.personality !== 'default' && (
                      <>, <strong className="text-white/90">{previewPromptConfig.personality}</strong> personality</>
                    )}
                    {previewPromptConfig.style && previewPromptConfig.style !== 'default' && (
                      <>, <strong className="text-white/90">{previewPromptConfig.style}</strong> style</>
                    )}
                  </p>
                </div>
                <button
                  className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                  onClick={() => setCurrentStep('config')}
                  title="Back to configuration"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Enhanced Preview */}
              <RegeneratePreview
                originalText={submission.markdown}
                newText={previewContent}
              />

              {/* Actions */}
              <div className="flex justify-between items-center pt-6 border-t border-white/10">
                <div className="flex gap-3">
                  <button
                    className="rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
                    onClick={() => {
                      setCurrentStep('config');
                      setPreviewContent('');
                    }}
                  >
                    Back to Settings
                  </button>
                  <Link
                    href={`/edit/${submission.id}`}
                    className="rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </Link>
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-2.5 text-sm font-semibold text-white hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
                  onClick={applyPreviewChanges}
                  disabled={regenerating || !previewContent}
                >
                  {regenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Applying Changes...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Apply Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

