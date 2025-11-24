'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

interface InlineAIFixProps {
  onFix: (selectedText: string, instruction?: string) => Promise<void>;
  disabled?: boolean;
}

export function InlineAIFix({ onFix, disabled = false }: InlineAIFixProps) {
  const [selectedText, setSelectedText] = useState('');
  const [showButton, setShowButton] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isFixing, setIsFixing] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setShowButton(false);
        setSelectedText('');
        return;
      }

      const text = selection.toString().trim();
      if (text.length > 0 && !disabled) {
        setSelectedText(text);
        
        // Get position for button
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10
        });
        setShowButton(true);
      } else {
        setShowButton(false);
        setSelectedText('');
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('keyup', handleSelection);
    };
  }, [disabled]);

  const handleImprove = async () => {
    if (!selectedText || isFixing) return;

    setIsFixing(true);
    setShowButton(false);

    try {
      await onFix(selectedText);
      // Clear selection
      window.getSelection()?.removeAllRanges();
      setSelectedText('');
    } catch (error) {
      console.error('Failed to apply AI fix:', error);
      setShowButton(true); // Show button again on error
    } finally {
      setIsFixing(false);
    }
  };

  if (!showButton || !selectedText) {
    return null;
  }

  return (
    <div
      ref={buttonRef}
      className="fixed z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)'
      }}
    >
      <button
        onClick={handleImprove}
        disabled={isFixing}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
      >
        {isFixing ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Improving...
          </>
        ) : (
          <>
            <Sparkles className="h-3 w-3" />
            Improve with AI
          </>
        )}
      </button>
    </div>
  );
}

