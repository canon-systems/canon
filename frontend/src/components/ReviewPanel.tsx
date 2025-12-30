'use client';

import { Send, FileText, Code, Edit, GitCompare } from 'lucide-react';
import { TemplateSelector } from '@/components/TemplateSelector';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type ViewMode = 'rendered' | 'raw' | 'editor' | 'diff';

interface ReviewPanelProps {
  docId: string;
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onOpenPublishModal: () => void;
  isProcessing?: boolean;
  onApplyTemplate?: (templateId: string) => Promise<void>;
  onViewDiff?: () => void;
}

export function ReviewPanel({
  currentView,
  onViewChange,
  onOpenPublishModal,
  isProcessing = false,
  onApplyTemplate,
  onViewDiff
}: ReviewPanelProps) {

  const handleViewChange = (view: ViewMode) => {
    onViewChange(view);
  };

  return (
    <div className="space-y-4">
      {/* Template and Diff Actions */}
      {(onApplyTemplate || onViewDiff) && (
        <div className="space-y-2 pb-4 border-b border-white/10">
          {onApplyTemplate && (
            <div className="w-full">
              <TemplateSelector
                onApply={onApplyTemplate}
                disabled={isProcessing}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            {onViewDiff && (
              <Button
                variant={currentView === 'diff' ? 'secondary' : 'outline'}
                onClick={() => {
                  handleViewChange('diff');
                  onViewDiff?.();
                }}
                disabled={isProcessing}
                className="w-full justify-center border-blue-400/40 bg-white/5 text-white hover:bg-white/10"
              >
                <GitCompare className="h-4 w-4" />
                View Diff
              </Button>
            )}
          </div>
        </div>
      )}

      {/* View Switcher */}
      <Tabs value={currentView} onValueChange={(value) => handleViewChange(value as ViewMode)}>
        <TabsList className="w-full justify-start rounded-full border border-white/10 bg-white/5 p-1">
          <TabsTrigger value="rendered" disabled={isProcessing} className="flex items-center gap-2 rounded-full">
            <FileText className="h-4 w-4" />
            Rendered
          </TabsTrigger>
          <TabsTrigger value="raw" disabled={isProcessing} className="flex items-center gap-2 rounded-full">
            <Code className="h-4 w-4" />
            Raw
          </TabsTrigger>
          <TabsTrigger value="editor" disabled={isProcessing} className="flex items-center gap-2 rounded-full">
            <Edit className="h-4 w-4" />
            Editor
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Publish Button */}
      <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
        <Button
          onClick={onOpenPublishModal}
          disabled={isProcessing}
          className="w-full gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition-all hover:from-purple-600 hover:to-pink-600 hover:-translate-y-0.5 hover:shadow-purple-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          <Send className="h-4 w-4" />
          Publish
        </Button>
      </div>
    </div>
  );
}
