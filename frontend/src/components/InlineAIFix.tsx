'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, X, Wand2, FileText, Languages, Zap, MessageSquare, Type, ChevronDown, Check } from 'lucide-react';

interface Model {
  value: string;
  label: string;
  provider: string;
  cost: string;
  context: string;
  description: string;
}

interface InlineAIFixProps {
  onFix: (selectedText: string, instruction?: string, model?: string) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  showAcceptReject?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  defaultModel?: string;
}

const availableModels: Model[] = [
  {
    value: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    cost: '$$$$',
    context: '128K tokens',
    description: 'Our most advanced, multimodal flagship model that\'s faster and 50% cheaper than GPT-4 Turbo.'
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
    value: 'o1-preview',
    label: 'O1 Preview',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '128K tokens',
    description: 'Advanced reasoning model optimized for complex problem-solving and deep analysis.'
  },
  {
    value: 'o1-mini',
    label: 'O1 Mini',
    provider: 'OpenAI',
    cost: '$$$',
    context: '128K tokens',
    description: 'A smaller, more affordable version of O1. Optimized for reasoning tasks.'
  },
  {
    value: 'gpt-4-turbo',
    label: 'GPT-4 Turbo',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '128K tokens',
    description: 'A large multimodal model that can solve complex tasks with greater accuracy.'
  },
  {
    value: 'gpt-3.5-turbo',
    label: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    cost: '$',
    context: '16K tokens',
    description: 'A high-performance, cost-effective model optimized for chat and text completion tasks.'
  },
  {
    value: 'claude-3-7-sonnet-20250219',
    label: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Anthropic\'s most advanced model with superior performance on complex reasoning, coding, and analysis tasks.'
  },
  {
    value: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    cost: '$$$$',
    context: '200K tokens',
    description: 'Our most intelligent model, with improved performance on coding tasks, math, and following complex instructions.'
  },
  {
    value: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    cost: '$$',
    context: '200K tokens',
    description: 'An improved version of Haiku with better performance while maintaining speed and cost efficiency.'
  },
  {
    value: 'claude-3-haiku-20240307',
    label: 'Claude 3 Haiku',
    provider: 'Anthropic',
    cost: '$',
    context: '200K tokens',
    description: 'Our fastest and most compact model for near-instant responsiveness.'
  },
  {
    value: 'google/gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    provider: 'Google',
    cost: '$$',
    context: '1M tokens',
    description: 'Google\'s latest 2.0 Flash model with massive 1M token context window. Optimized for speed and efficiency.'
  },
  {
    value: 'google/gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash Lite',
    provider: 'Google',
    cost: '$',
    context: '1M tokens',
    description: 'A lighter, more cost-effective version of Gemini 2.0 Flash. Fast and efficient for most use cases.'
  }
];

interface InstructionOption {
  id: string;
  label: string;
  instruction: string;
  icon: any;
  category: string;
}

const premadeInstructions: InstructionOption[] = [
  {
    id: 'improve',
    label: 'Improve clarity',
    instruction: 'Improve this section for clarity, readability, and flow. Make it more concise and easier to understand.',
    icon: Zap,
    category: 'general'
  },
  {
    id: 'grammar',
    label: 'Fix grammar',
    instruction: 'Proofread and fix any grammar, spelling, or punctuation errors in this section.',
    icon: FileText,
    category: 'general'
  },
  {
    id: 'simplify',
    label: 'Simplify language',
    instruction: 'Simplify the language and make it more accessible. Use simpler words and shorter sentences where possible.',
    icon: MessageSquare,
    category: 'general'
  },
  {
    id: 'expand',
    label: 'Expand detail',
    instruction: 'Expand this section with more detail, examples, and explanations. Make it more comprehensive.',
    icon: Type,
    category: 'general'
  },
  {
    id: 'technical',
    label: 'Make more technical',
    instruction: 'Make this section more technical and detailed. Add technical terminology and deeper explanations.',
    icon: Languages,
    category: 'style'
  },
  {
    id: 'professional',
    label: 'Make more professional',
    instruction: 'Rewrite this section in a more professional and formal tone. Ensure it follows professional writing standards.',
    icon: FileText,
    category: 'style'
  },
  {
    id: 'casual',
    label: 'Make more casual',
    instruction: 'Rewrite this section in a more casual and friendly tone. Make it more conversational and approachable.',
    icon: MessageSquare,
    category: 'style'
  },
  {
    id: 'structure',
    label: 'Improve structure',
    instruction: 'Improve the structure and organization of this section. Ensure logical flow and clear hierarchy.',
    icon: Wand2,
    category: 'structure'
  }
];

export function InlineAIFix({
  onFix,
  onCancel,
  disabled = false,
  isStreaming = false,
  showAcceptReject = false,
  onAccept,
  onReject,
  defaultModel = 'gpt-4o'
}: InlineAIFixProps) {
  const [selectedText, setSelectedText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isFixing, setIsFixing] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const categories = ['all', 'general', 'style', 'structure'];
  const categoryLabels: Record<string, string> = {
    all: 'All',
    general: 'General',
    style: 'Style',
    structure: 'Structure'
  };

  const filteredInstructions = selectedCategory === 'all'
    ? premadeInstructions
    : premadeInstructions.filter(inst => inst.category === selectedCategory);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setShowMenu(false);
        setSelectedText('');
        setShowCustomInput(false);
        setCustomInstruction('');
        return;
      }

      const text = selection.toString().trim();
      if (text.length > 0 && !disabled) {
        setSelectedText(text);

        // Get position for menu
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10
        });
        setShowMenu(true);
      } else {
        setShowMenu(false);
        setSelectedText('');
        setShowCustomInput(false);
        setCustomInstruction('');
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('keyup', handleSelection);
    };
  }, [disabled]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // Don't close if clicking on the selection itself
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const target = event.target as Node;
          // Check if target is within the range using standard DOM API
          try {
            const commonAncestor = range.commonAncestorContainer;
            // Check if target is within the common ancestor of the selection
            if (commonAncestor.contains(target)) {
              // Check if target is within the range by comparing boundary points
              const targetRange = document.createRange();
              targetRange.selectNode(target);

              // Compare if target range intersects with selection range
              const startCompare = range.compareBoundaryPoints(Range.START_TO_END, targetRange);
              const endCompare = range.compareBoundaryPoints(Range.END_TO_START, targetRange);

              // If target range is within or overlaps the selection range
              if (startCompare > 0 && endCompare < 0) {
                return;
              }
            }
          } catch (e) {
            // If range operations fail, fall through and close the menu
          }
        }
        setShowMenu(false);
        setShowCustomInput(false);
        setCustomInstruction('');
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showMenu]);

  const handleApply = async (instruction: string) => {
    if (!selectedText || isFixing) return;

    setIsFixing(true);
    setShowMenu(false);
    setShowCustomInput(false);
    setCustomInstruction('');

    try {
      await onFix(selectedText, instruction, selectedModel);
      // Don't clear selection yet - wait for accept/reject
      // The menu will be controlled by isStreaming and showAcceptReject props
    } catch (error) {
      console.error('Failed to apply AI fix:', error);
      setShowMenu(true); // Show menu again on error
      setIsFixing(false);
    }
  };

  const handleCustomSubmit = () => {
    if (customInstruction.trim()) {
      handleApply(customInstruction.trim());
    }
  };

  // Close model dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    }

    if (showModelDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showModelDropdown]);

  const selectedModelObj = availableModels.find(m => m.value === selectedModel) || availableModels[0];

  // Show menu if it's open, or if we're streaming/showing accept-reject
  const shouldShow = showMenu || isStreaming || showAcceptReject;

  if (!shouldShow) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)'
      }}
    >
      <div className="w-80 rounded-lg border border-white/20 bg-black/95 backdrop-blur-md shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-purple-500/20 to-pink-500/20">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">Improve with AI</span>
          </div>
          <button
            onClick={() => {
              setShowMenu(false);
              setShowCustomInput(false);
              setCustomInstruction('');
              window.getSelection()?.removeAllRanges();
            }}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {(isFixing || isStreaming) ? (
          <div className="px-4 py-6 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
            <span className="text-sm text-white/70">
              {isStreaming ? 'Streaming improvements...' : 'Improving text...'}
            </span>
            {(isStreaming || isFixing) && onCancel && (
              <button
                onClick={() => {
                  onCancel();
                  setIsFixing(false);
                  setShowMenu(false);
                }}
                className="mt-2 px-4 py-2 text-xs font-medium rounded-md bg-white/10 text-white/90 hover:bg-red-500/20 hover:text-red-200 border border-white/20 hover:border-red-500/50 transition-all flex items-center justify-center gap-2"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
            )}
          </div>
        ) : showAcceptReject ? (
          <div className="p-4">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-green-400" />
                <span className="text-sm font-medium text-white">Improvements ready</span>
              </div>
              <p className="text-xs text-white/60">
                Review the changes in the editor. Accept to keep the improvements or reject to revert.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onAccept?.();
                  setShowMenu(false);
                  setShowCustomInput(false);
                  setCustomInstruction('');
                }}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 transition-all flex items-center justify-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Accept
              </button>
              <button
                onClick={() => {
                  onReject?.();
                  setShowMenu(false);
                  setShowCustomInput(false);
                  setCustomInstruction('');
                }}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-white/10 text-white/90 hover:bg-red-500/20 hover:text-red-200 border border-white/20 hover:border-red-500/50 transition-all flex items-center justify-center gap-2"
              >
                <X className="h-4 w-4" />
                Reject
              </button>
            </div>
          </div>
        ) : showCustomInput ? (
          <div className="p-4">
            <div className="mb-3">
              <label className="block text-xs font-medium text-white/70 mb-2">
                Custom Instruction
              </label>
              <textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="Enter your custom instruction..."
                className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-md text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 resize-none"
                rows={3}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleCustomSubmit();
                  }
                  if (e.key === 'Escape') {
                    setShowCustomInput(false);
                    setCustomInstruction('');
                  }
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCustomSubmit}
                disabled={!customInstruction.trim()}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Apply
              </button>
              <button
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomInstruction('');
                }}
                className="px-3 py-2 text-sm font-medium rounded-md bg-white/10 text-white/90 hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
            <p className="mt-2 text-xs text-white/50">Press Cmd/Ctrl + Enter to apply</p>
          </div>
        ) : (
          <>
            {/* Model Selector */}
            <div className="px-4 py-3 border-b border-white/10 bg-white/5">
              <label className="block text-xs font-medium text-white/70 mb-2">
                AI Model
              </label>
              <div className="relative" ref={modelDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="w-full px-3 py-2 text-sm text-left rounded-md bg-white/5 border border-white/20 text-white/90 hover:bg-white/10 hover:border-white/30 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{selectedModelObj.label}</span>
                    <span className="text-xs text-white/60">({selectedModelObj.provider})</span>
                    <span className="text-xs text-yellow-400">{selectedModelObj.cost}</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-white/60 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showModelDropdown && (
                  <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-white/20 bg-gray-900 shadow-xl">
                    {availableModels.map(model => (
                      <button
                        key={model.value}
                        type="button"
                        className={`w-full px-4 py-3 text-left transition-colors hover:bg-white/10 focus:bg-white/10 focus:outline-none ${selectedModel === model.value ? 'bg-white/15' : ''
                          }`}
                        onClick={() => {
                          setSelectedModel(model.value);
                          setShowModelDropdown(false);
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white text-sm">{model.label}</span>
                              {model.provider && <span className="text-xs text-white/60">({model.provider})</span>}
                              {model.cost && <span className="text-xs font-medium text-yellow-400">{model.cost}</span>}
                              {model.context && <span className="text-xs font-medium text-blue-400">{model.context}</span>}
                            </div>
                            {model.description && (
                              <p className="text-xs leading-relaxed text-white/70">{model.description}</p>
                            )}
                          </div>
                          {selectedModel === model.value && (
                            <Check className="h-4 w-4 shrink-0 text-green-400" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Category Filter */}
            <div className="px-4 py-2 border-b border-white/10 bg-white/5">
              <div className="flex gap-1 overflow-x-auto">
                {categories.map((cat) => {
                  const Icon = cat === 'all' ? Sparkles : premadeInstructions.find(i => i.category === cat)?.icon || Sparkles;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${selectedCategory === cat
                          ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50'
                          : 'text-white/60 hover:text-white/80 hover:bg-white/10'
                        }`}
                    >
                      <Icon className="h-3 w-3" />
                      {categoryLabels[cat]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Instructions List */}
            <div className="max-h-64 overflow-y-auto">
              {filteredInstructions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    onClick={() => handleApply(option.instruction)}
                    disabled={isFixing}
                    className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors border-b border-white/10 last:border-b-0 disabled:opacity-50 flex items-start gap-3 group"
                  >
                    <div className="mt-0.5">
                      <Icon className="h-4 w-4 text-white/60 group-hover:text-purple-400 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm group-hover:text-purple-200 transition-colors">
                        {option.label}
                      </div>
                      <div className="text-xs text-white/50 mt-0.5 line-clamp-2">
                        {option.instruction}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Instruction Button */}
            <div className="px-4 py-3 border-t border-white/10 bg-white/5">
              <button
                onClick={() => setShowCustomInput(true)}
                className="w-full px-3 py-2 text-sm font-medium rounded-md border border-white/20 bg-white/5 text-white/90 hover:bg-white/10 hover:border-white/30 transition-all flex items-center justify-center gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                Custom Instruction
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

