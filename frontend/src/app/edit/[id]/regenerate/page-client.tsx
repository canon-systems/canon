'use client';

// RegeneratePageClient component for regenerating documentation
// Version: 2024-12-22 - Fixed ShadUI components and removed deprecated state

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, X, ArrowLeft, Check, RefreshCw, Settings, Eye, Sparkles, AlertCircle, Info } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { RegeneratePreview } from '@/components/RegeneratePreview';
import { DocumentConfiguration } from '@/components/DocumentConfiguration';
import type { DocumentStructureConfig } from '@/components/DocumentStructure';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
    value: 'openai/gpt-5.2',
    label: 'GPT-5.2',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '400K tokens',
    description: 'OpenAI\'s latest flagship model with enhanced capabilities and improved performance across all tasks.'
  },
  {
    value: 'openai/gpt-5',
    label: 'GPT-5',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '400K tokens',
    description: 'OpenAI\'s powerful GPT-5 model with advanced reasoning and multimodal capabilities.'
  },
  {
    value: 'openai/gpt-5-nano',
    label: 'GPT-5 Nano',
    provider: 'OpenAI',
    cost: '$$',
    context: '400K tokens',
    description: 'A compact, cost-effective GPT-5 variant optimized for efficiency.'
  },
  {
    value: 'openai/gpt-4o',
    label: 'GPT-4',
    provider: 'OpenAI',
    cost: '$$$$',
    context: '128K tokens',
    description: 'OpenAI\'s advanced multimodal flagship model that\'s faster and 50% cheaper than GPT-4 Turbo. GPT-4o ("o" for "omni") is trained across text, vision, and audio.'
  },
  {
    value: 'openai/gpt-4.1-nano',
    label: 'GPT-4 Nano',
    provider: 'OpenAI',
    cost: '$$',
    context: '128K tokens',
    description: 'A compact, cost-effective GPT-4 variant optimized for efficiency and speed.'
  },
  // Anthropic Models
  {
    value: 'anthropic/claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Anthropic\'s advanced Sonnet 4 model with superior performance on complex reasoning, coding, and analysis tasks.'
  },
  {
    value: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Anthropic\'s most advanced Sonnet model with superior performance on complex reasoning, coding, and analysis tasks.'
  },
  {
    value: 'anthropic/claude-opus-4',
    label: 'Claude Opus 4',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Anthropic\'s powerful Opus 4 model for highly complex tasks requiring deep analysis, complex content creation, and research.'
  },
  {
    value: 'anthropic/claude-opus-4.5',
    label: 'Claude Opus 4.5',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Anthropic\'s most powerful model for highly complex tasks requiring deep analysis, complex content creation, and research.'
  },
  // Google Models
  {
    value: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    cost: '$$$$',
    context: '1M tokens',
    description: 'Google\'s powerful Gemini 2.5 Pro model with massive 1M token context window. Supports text, vision, audio, and function calling.'
  },
  {
    value: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    cost: '$$',
    context: '1M tokens',
    description: 'Google\'s Gemini 2.5 Flash model optimized for speed and efficiency with massive 1M token context window.'
  },
  {
    value: 'google/gemini-3-pro-preview',
    label: 'Gemini 3 Pro',
    provider: 'Google',
    cost: '$$$$$',
    context: '1M tokens',
    description: 'Google\'s latest Gemini 3 Pro model. Excels at reasoning, agentic workflows, multi-step function calling, and planning. Shows 17% improvement in correctness over Gemini 2.5 Pro.'
  },
  {
    value: 'google/gemini-3-flash',
    label: 'Gemini 3 Flash',
    provider: 'Google',
    cost: '$$',
    context: '1M tokens',
    description: 'Google\'s latest Gemini 3 Flash model optimized for speed and efficiency with massive 1M token context window.'
  }
];

export function RegeneratePageClient({ submission }: RegeneratePageClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const [currentStep, setCurrentStep] = useState<'config' | 'preview'>('config');
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewModel, setPreviewModel] = useState('');
  const [previewPromptConfig, setPreviewPromptConfig] = useState<any>({});
  const [previewError, setPreviewError] = useState('');
  const [significanceAnalysis, setSignificanceAnalysis] = useState<any>(null);
  const [selectedRegenModel, setSelectedRegenModel] = useState(submission.source_meta?.model || 'openai/gpt-4o');

  // Configuration save state
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveMessage, setConfigSaveMessage] = useState('');
  const [configSaveError, setConfigSaveError] = useState('');
  const [showConfigConfirm, setShowConfigConfirm] = useState(false);
  const [regenPromptConfig, setRegenPromptConfig] = useState(
    submission.source_meta?.llm_prompt_config || {
      personality: 'default',
      style: 'default',
      perspective: 'default',
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
  const [regenerating, setRegenerating] = useState(false);

  const selectedRegenModelObj = availableModels.find(m => m.value === selectedRegenModel) || availableModels[0];


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
      setSignificanceAnalysis(result.significanceAnalysis || null);
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
          previewContent: previewContent,
          regenerationSettings: {
            personality: regenPromptConfig.personality,
            style: regenPromptConfig.style,
            perspective: regenPromptConfig.perspective,
            audience: regenPromptConfig.audience,
            temperature: regenPromptConfig.temperature,
            customInstructions: regenPromptConfig.customInstructions,
            documentStructure: structureConfig,
            model: selectedRegenModel
          }
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

  async function showConfigSaveConfirm() {
    setShowConfigConfirm(true);
  }

  async function saveConfiguration() {
    setConfigSaveError('');
    setConfigSaveMessage('');
    setSavingConfig(true);
    setShowConfigConfirm(false);

    try {
      const configuration = {
        personality: regenPromptConfig.personality,
        style: regenPromptConfig.style,
        perspective: regenPromptConfig.perspective,
        audience: regenPromptConfig.audience,
        customInstructions: regenPromptConfig.customInstructions,
        temperature: regenPromptConfig.temperature,
        documentStructure: structureConfig,
        model: selectedRegenModel
      };

      const { error } = await supabase
        .from('documents')
        .update({
          configuration: configuration,
          updated_at: new Date().toISOString()
        })
        .eq('id', submission.id);

      if (error) throw new Error(error.message);
      setConfigSaveMessage('Configuration settings saved. These will be used for future regenerations.');
      setTimeout(() => setConfigSaveMessage(''), 3000);
    } catch (e) {
      const errorMsg = String(e);
      setConfigSaveError(errorMsg);
      setTimeout(() => setConfigSaveError(''), 5000);
      throw e;
    } finally {
      setSavingConfig(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <RefreshCw className="h-8 w-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Regenerate Documentation</h1>
          </div>
          <p className="text-white/70">
            Update your documentation with new AI-generated content.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className={`flex items-center gap-2 text-sm ${currentStep === 'config' ? 'text-white' : 'text-white/50'}`}>
            <div className={`flex h-6 w-6 items-center justify-center rounded-full border ${currentStep === 'config'
              ? 'border-purple-500/60 bg-purple-500/10 text-purple-300'
              : 'border-white/20 bg-white/5 text-white/50'
              }`}>
              {currentStep === 'config' ? (
                <Settings className="h-3 w-3" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </div>
            <span>Configure</span>
          </div>
          <div className="h-px w-8 bg-white/20" />
          <div className={`flex items-center gap-2 text-sm ${currentStep === 'preview' ? 'text-white' : 'text-white/50'}`}>
            <div className={`flex h-6 w-6 items-center justify-center rounded-full border ${currentStep === 'preview'
              ? 'border-purple-500/60 bg-purple-500/10 text-purple-300'
              : 'border-white/20 bg-white/5 text-white/50'
              }`}>
              <Eye className="h-3 w-3" />
            </div>
            <span>Preview</span>
          </div>
        </div>

        {/* Main Content */}
        <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-semibold text-white">
              {currentStep === 'config' ? 'Configure Regenerate' : 'Preview Changes'}
            </CardTitle>
            <CardDescription className="text-white/70">
              {currentStep === 'config'
                ? 'Choose your LLM and customize the prompt settings to regenerate your documentation.'
                : 'Review the changes before applying them to your documentation.'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentStep === 'config' ? (
              /* Configuration Step */
              <div className="space-y-8">

                {/* Model Selection */}
                <div>
                  <label className="mb-3 block text-sm font-semibold text-white/90">
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      LLM
                    </span>
                  </label>
                  <Select value={selectedRegenModel} onValueChange={setSelectedRegenModel} disabled={generatingPreview}>
                    <SelectTrigger>
                      <SelectValue>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{selectedRegenModelObj.label}</span>
                          <span className="text-xs text-white/60">({selectedRegenModelObj.provider})</span>
                          <span className="text-xs text-yellow-400">{selectedRegenModelObj.cost}</span>
                          <span className="text-xs text-blue-400">{selectedRegenModelObj.context}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-96">
                      {availableModels.map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          <div className="flex items-start justify-between gap-3 w-full">
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
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Configuration Settings */}
                <div className="space-y-4">
                  <DocumentConfiguration
                    promptConfig={regenPromptConfig}
                    onPromptConfigChange={setRegenPromptConfig}
                    structureConfig={structureConfig}
                    onStructureConfigChange={setStructureConfig}
                    onSave={showConfigSaveConfirm}
                    saving={savingConfig}
                    saveMessage={configSaveMessage}
                    saveError={configSaveError}
                  />
                </div>


                {/* Error Message */}
                {previewError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {previewError}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Actions */}
                <div className="flex justify-between items-center pt-6 border-t border-white/10">
                  <Button asChild variant="outline">
                    <Link href={`/edit/${submission.id}`}>
                      Cancel
                    </Link>
                  </Button>
                  <Button
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
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
                  </Button>
                </div>
              </div>
            ) : (
              /* Preview Step */
              <div className="space-y-6">
                <div className="mb-6">
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
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentStep('config')}
                  title="Back to configuration"
                >
                  <X className="h-5 w-5" />
                </Button>

                {/* Unavailable Files Warning */}
                {significanceAnalysis?.unavailableFiles && significanceAnalysis.unavailableFiles.length > 0 && (
                  <Alert variant="warning">
                    <Info className="h-5 w-5" />
                    <AlertTitle>
                      Some files couldn't be analyzed
                    </AlertTitle>
                    <AlertDescription>
                      {significanceAnalysis.unavailableFiles.length} file{significanceAnalysis.unavailableFiles.length === 1 ? '' : 's'} {significanceAnalysis.unavailableFiles.length === 1 ? 'was' : 'were'} unavailable during analysis. This may affect the accuracy of the significance assessment.
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {significanceAnalysis.unavailableFiles.map((file: { path: string; reason: string; commitSha: string }, idx: number) => (
                          <div key={idx} className="text-xs text-orange-200/70 bg-orange-500/10 rounded px-2 py-1">
                            <div className="font-mono">{file.path}</div>
                            <div className="text-orange-200/60 mt-0.5">{file.reason}</div>
                          </div>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Significance Analysis Warning */}
                {significanceAnalysis && !significanceAnalysis.isSignificant && (
                  <Alert variant="warning">
                    <AlertCircle className="h-5 w-5" />
                    <AlertTitle>
                      Changes may not be significant
                    </AlertTitle>
                    <AlertDescription>
                      {significanceAnalysis.reason}
                      {significanceAnalysis.summary && (
                        <p className="text-xs text-yellow-200/70 mb-2">
                          {significanceAnalysis.summary}
                        </p>
                      )}
                      {significanceAnalysis.technicalChanges && (
                        <div className="text-xs text-yellow-200/70 mb-2">
                          <strong>Technical:</strong> {significanceAnalysis.technicalChanges.level} - {significanceAnalysis.technicalChanges.description}
                        </div>
                      )}
                      {significanceAnalysis.businessLogicChanges && (
                        <div className="text-xs text-yellow-200/70">
                          <strong>Business Logic:</strong> {significanceAnalysis.businessLogicChanges.level} - {significanceAnalysis.businessLogicChanges.description}
                        </div>
                      )}
                      <p className="text-xs text-yellow-200/60 mt-3 italic">
                        You can still proceed with regeneration if needed.
                      </p>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Significance Analysis Success */}
                {significanceAnalysis && significanceAnalysis.isSignificant && (
                  <Alert variant="success">
                    <Check className="h-5 w-5" />
                    <AlertTitle>
                      Significant changes detected
                    </AlertTitle>
                    <AlertDescription>
                      {significanceAnalysis.reason}
                      {significanceAnalysis.summary && (
                        <p className="text-xs text-green-200/70">
                          {significanceAnalysis.summary}
                        </p>
                      )}
                      {significanceAnalysis.unavailableFiles && significanceAnalysis.unavailableFiles.length > 0 && (
                        <p className="text-xs text-green-200/60 mt-2 italic">
                          Note: {significanceAnalysis.unavailableFiles.length} file{significanceAnalysis.unavailableFiles.length === 1 ? '' : 's'} couldn't be analyzed, but significant changes were still detected in other files.
                        </p>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Enhanced Preview */}
                <RegeneratePreview
                  originalText={submission.markdown}
                  newText={previewContent}
                />

                {/* Actions */}
                <div className="flex justify-between items-center pt-6 border-t border-white/10">
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCurrentStep('config');
                        setPreviewContent('');
                        setSignificanceAnalysis(null);
                      }}
                    >
                      Back to Settings
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/edit/${submission.id}`}>
                        Cancel
                      </Link>
                    </Button>
                  </div>
                  <Button
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
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
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Configuration Save Confirmation Dialog */}
      <Dialog open={showConfigConfirm} onOpenChange={setShowConfigConfirm}>
        <DialogContent className="bg-gray-900 border border-white/20">
          <DialogHeader>
            <DialogTitle className="text-white">Save Configuration Changes</DialogTitle>
            <DialogDescription className="text-white/70">
              Are you sure you want to save these configuration changes? This will update the document's configuration settings and affect future regenerations.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfigConfirm(false)}
              className="border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={saveConfiguration}
              disabled={savingConfig}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {savingConfig ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <span>Save Configuration</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

