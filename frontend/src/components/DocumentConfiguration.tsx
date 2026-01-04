'use client';

import { useState } from 'react';
import { PromptCustomizer } from '@/components/PromptCustomizer';
import { DocumentStructure, type DocumentStructureConfig } from '@/components/DocumentStructure';
import { Button } from '@/components/ui/button';

interface PromptConfig {
  personality?: string;
  style?: string;
  perspective?: string;
  audience?: string;
  customInstructions?: string;
  temperature?: number;
}

interface DocumentConfigurationProps {
  promptConfig: PromptConfig;
  onPromptConfigChange: (config: PromptConfig) => void;
  structureConfig: DocumentStructureConfig;
  onStructureConfigChange: (config: DocumentStructureConfig) => void;
  onSave?: () => Promise<void>;
  saving?: boolean;
  saveMessage?: string;
  saveError?: string;
}

export function DocumentConfiguration({
  promptConfig,
  onPromptConfigChange,
  structureConfig,
  onStructureConfigChange,
  onSave,
  saving = false,
  saveMessage,
  saveError,
}: DocumentConfigurationProps) {
  return (
    <div className="rounded-lg border border-white/20 bg-white/5 p-4">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 rounded bg-purple-500/20 flex items-center justify-center">
            <div className="h-2 w-2 rounded bg-purple-400"></div>
          </div>
          <h3 className="text-lg font-medium text-white">Documentation Configuration</h3>
          <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">
            Combined Settings
          </span>
        </div>

        <p className="text-sm text-white/60 mb-6">
          Configure the style, personality, and structure for your documentation generation.
        </p>
      </div>

      <div className="space-y-6">
        {/* Prompt Customization Section */}
        <div>
          <PromptCustomizer
            promptConfig={promptConfig}
            onChange={onPromptConfigChange}
          />
        </div>

        {/* Document Structure Section */}
        <div>
          <DocumentStructure
            config={structureConfig}
            onChange={onStructureConfigChange}
          />
        </div>
      </div>

      {/* Save Controls */}
      {onSave && (
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {saveMessage && (
                <div className="text-xs text-green-300">{saveMessage}</div>
              )}
              {saveError && (
                <div className="text-xs text-red-300">{saveError}</div>
              )}
            </div>
            <Button
              type="button"
              className="flex items-center gap-2 bg-purple-600 text-sm font-medium text-white hover:bg-purple-700"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
