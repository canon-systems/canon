'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import {
  RotateCcw,
  RotateCw,
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code as CodeIcon,
  Link as LinkIcon,
  List as ListBullets,
  ListOrdered,
  Quote,
  SquareCode,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Image as ImageIcon,
  X
} from 'lucide-react';

interface RichTextEditorProps {
  initialHTML?: string;
  editable?: boolean;
  onChange?: (data: { html: string; json: JSONContent; text: string }) => void;
  onCursorChange?: (ratio: number) => void;
}

// Clamp helper for 0..1
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function RichTextEditor({
  initialHTML = '',
  editable = true,
  onChange,
  onCursorChange
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isEditingLink, setIsEditingLink] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Markdown shortcuts are enabled by default in StarterKit:
        // - **text** or __text__ for bold
        // - *text* or _text_ for italic
        // - ``` for code blocks
        // - # for headings
        // - > for blockquotes
        // - - or * for bullet lists
        // - 1. for ordered lists
      }),
      Underline,
      Link.configure({ openOnClick: true, autolink: true, linkOnPaste: true }),
      Image,
      TextAlign.configure({ types: ['heading', 'paragraph'] })
    ],
    editable,
    content: initialHTML || '<p></p>',
    immediatelyRender: false, // Prevent SSR hydration mismatches
    onUpdate: ({ editor }) => {
      const json = editor.getJSON() as JSONContent;
      onChange?.({
        html: editor.getHTML(),
        json,
        text: editor.getText()
      });
      // Emit cursor position for scroll sync
      emitCursorRatioFromSelection();
    },
    onSelectionUpdate: () => {
      emitCursorRatioFromSelection();
    }
  });

  // Update editable state when prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Update editor content when initialHTML prop changes
  useEffect(() => {
    if (editor && initialHTML) {
      const currentHTML = editor.getHTML();
      // Only update if the content is actually different to avoid unnecessary updates
      if (currentHTML !== initialHTML) {
        editor.commands.setContent(initialHTML, { emitUpdate: false }); // don't emit update event
      }
    }
  }, [editor, initialHTML]);

  // Emit a normalized ratio based on caret position within the scroll area
  function emitCursorRatioFromSelection(): void {
    if (!editor || !editorRef.current) return;

    const pos = editor.state.selection.$anchor.pos;
    const caret = editor.view.coordsAtPos(pos);
    const elRect = editorRef.current.getBoundingClientRect();
    const caretYInEl = caret.top - elRect.top + (editorRef.current.scrollTop || 0);

    const maxScroll = Math.max(1, (editorRef.current.scrollHeight || 0) - (editorRef.current.clientHeight || 0));
    const ratio = clamp(caretYInEl / maxScroll, 0, 1);
    onCursorChange?.(ratio);
  }

  // Emit a ratio purely from scrollTop, used when user scrolls
  function emitCursorRatioFromScroll(): void {
    if (!editorRef.current) return;
    const maxScroll = Math.max(1, (editorRef.current.scrollHeight || 0) - (editorRef.current.clientHeight || 0));
    const ratio = clamp((editorRef.current.scrollTop || 0) / maxScroll, 0, 1);
    onCursorChange?.(ratio);
  }

  // Add scroll listener
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    el.addEventListener('scroll', emitCursorRatioFromScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', emitCursorRatioFromScroll);
    };
  }, []);

  // Add custom keyboard shortcuts
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const { ctrlKey, metaKey, shiftKey, key } = event;
      const mod = ctrlKey || metaKey; // Works on both Windows/Linux (Ctrl) and macOS (Cmd)

      // Heading shortcuts: Cmd/Ctrl + 1, 2, 3
      if (mod && !shiftKey && ['1', '2', '3'].includes(key)) {
        event.preventDefault();
        const level = parseInt(key) as 1 | 2 | 3;
        editor.chain().focus().toggleHeading({ level }).run();
        return;
      }

      // Link shortcut: Cmd/Ctrl + K
      if (mod && !shiftKey && key === 'k') {
        event.preventDefault();
        setLink();
        return;
      }

      // Blockquote: Cmd/Ctrl + Shift + B
      if (mod && shiftKey && key === 'B') {
        event.preventDefault();
        editor.chain().focus().toggleBlockquote().run();
        return;
      }

      // Code block: Cmd/Ctrl + Shift + C
      if (mod && shiftKey && key === 'C') {
        event.preventDefault();
        editor.chain().focus().toggleCodeBlock().run();
        return;
      }

      // Horizontal rule: Cmd/Ctrl + Shift + H
      if (mod && shiftKey && key === 'H') {
        event.preventDefault();
        editor.chain().focus().setHorizontalRule().run();
        return;
      }

      // Underline: Cmd/Ctrl + U (standard, but ensuring it works)
      if (mod && !shiftKey && key === 'u') {
        event.preventDefault();
        editor.chain().focus().toggleUnderline().run();
        return;
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener('keydown', handleKeyDown);

    return () => {
      editorElement.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]); // setLink is stable, so we can safely ignore it

  // Toolbar button classes
  function btn(active = false, disabled = false) {
    return [
      'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm',
      'transition-all duration-200 select-none',
      disabled
        ? 'border-white/10 text-white/40 bg-white/5 cursor-not-allowed opacity-50'
        : 'border-white/20 text-white/90 bg-white/5 hover:bg-white/10 hover:border-white/30',
      active && !disabled ? 'bg-white/20 border-white/30 text-white shadow-sm' : ''
    ].join(' ');
  }

  // Open link modal
  function setLink(): void {
    if (!editor) return;
    const attrs = editor.getAttributes('link');
    if (attrs.href) {
      setLinkUrl(attrs.href);
      setIsEditingLink(true);
    } else {
      setLinkUrl('');
      setIsEditingLink(false);
    }
    setLinkModalOpen(true);
  }

  // Confirm link
  function confirmLink(): void {
    if (!editor) return;
    if (linkUrl.trim() === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run();
    }
    setLinkModalOpen(false);
    setLinkUrl('');
    setIsEditingLink(false);
  }

  // Open image modal
  function insertImage(): void {
    if (!editor) return;
    setImageUrl('');
    setImageModalOpen(true);
  }

  // Confirm image
  function confirmImage(): void {
    if (!editor || !imageUrl.trim()) return;
    editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    setImageModalOpen(false);
    setImageUrl('');
  }

  if (!editor) {
    return null;
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-lg backdrop-blur-md">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/30 p-3 backdrop-blur-sm">
          {/* Undo / Redo */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btn(false, !editor.can().undo())}
              title="Undo (Ctrl+Z / Cmd+Z)"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(false, !editor.can().redo())}
              title="Redo (Ctrl+Shift+Z / Cmd+Shift+Z)"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-1 h-6 w-px bg-white/10"></div>

          {/* Paragraph + Headings */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btn(editor.isActive('paragraph'), false)}
              title="Paragraph (Ctrl+Alt+0)"
              onClick={() => editor.chain().focus().setParagraph().run()}
            >
              <Pilcrow className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('heading', { level: 1 }), false)}
              title="Heading 1 (Ctrl+1 / Cmd+1)"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <Heading1 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('heading', { level: 2 }), false)}
              title="Heading 2 (Ctrl+2 / Cmd+2)"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('heading', { level: 3 }), false)}
              title="Heading 3 (Ctrl+3 / Cmd+3)"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <Heading3 className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-1 h-6 w-px bg-white/10"></div>

          {/* Inline formatting */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btn(editor.isActive('bold'), false)}
              title="Bold (Ctrl+B / Cmd+B)"
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('italic'), false)}
              title="Italic (Ctrl+I / Cmd+I)"
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('underline'), false)}
              title="Underline (Ctrl+U / Cmd+U)"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('strike'), false)}
              title="Strikethrough (Ctrl+Shift+S / Cmd+Shift+S)"
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('code'), false)}
              title="Inline code (Ctrl+E / Cmd+E)"
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <CodeIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('link'), false)}
              title="Insert or edit link (Ctrl+K / Cmd+K)"
              onClick={setLink}
            >
              <LinkIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-1 h-6 w-px bg-white/10"></div>

          {/* Lists and blocks */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btn(editor.isActive('bulletList'), false)}
              title="Bullet list (Ctrl+Shift+8 / Cmd+Shift+8)"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <ListBullets className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('orderedList'), false)}
              title="Numbered list (Ctrl+Shift+7 / Cmd+Shift+7)"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('blockquote'), false)}
              title="Blockquote (Ctrl+Shift+B / Cmd+Shift+B)"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Quote className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('codeBlock'), false)}
              title="Code block (Ctrl+Shift+C / Cmd+Shift+C)"
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              <SquareCode className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(false, false)}
              title="Horizontal rule (Ctrl+Shift+H / Cmd+Shift+H)"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-1 h-6 w-px bg-white/10"></div>

          {/* Alignment */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btn(editor.isActive({ textAlign: 'left' }), false)}
              title="Align left"
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
            >
              <AlignLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive({ textAlign: 'center' }), false)}
              title="Align center"
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
            >
              <AlignCenter className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive({ textAlign: 'right' }), false)}
              title="Align right"
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
            >
              <AlignRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn(editor.isActive({ textAlign: 'justify' }), false)}
              title="Justify"
              onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            >
              <AlignJustify className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-1 h-6 w-px bg-white/10"></div>

          {/* Images */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btn(false, false)}
              title="Insert image (URL)"
              onClick={insertImage}
            >
              <ImageIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Editor Canvas */}
        <div
          ref={editorRef}
          className="prose prose-invert max-w-none flex-1 overflow-y-auto border-t border-white/10 bg-white/5 p-6 text-white transition-colors focus-within:bg-white/10"
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Link Modal */}
      {linkModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setLinkModalOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setLinkModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                {isEditingLink ? 'Edit Link' : 'Insert Link'}
              </h2>
              <button
                className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                onClick={() => setLinkModalOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mb-2 block text-sm text-white/70">URL</label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="mb-4 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmLink();
                if (e.key === 'Escape') setLinkModalOpen(false);
              }}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
                onClick={() => setLinkModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                onClick={confirmLink}
              >
                {isEditingLink ? 'Update' : 'Insert'}
              </button>
              {isEditingLink && (
                <button
                  className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-300 hover:bg-red-500/20"
                  onClick={() => {
                    if (editor) {
                      editor.chain().focus().unsetLink().run();
                    }
                    setLinkModalOpen(false);
                    setLinkUrl('');
                    setIsEditingLink(false);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {imageModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setImageModalOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setImageModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Insert Image</h2>
              <button
                className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                onClick={() => setImageModalOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mb-2 block text-sm text-white/70">Image URL</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="mb-4 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmImage();
                if (e.key === 'Escape') setImageModalOpen(false);
              }}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
                onClick={() => setImageModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={confirmImage}
                disabled={!imageUrl.trim()}
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        /* TipTap editor content styling to match app design */
        [contenteditable='true'] {
          outline: none;
        }

        [contenteditable='true']:focus {
          outline: none;
        }

        /* Style headings */
        [contenteditable='true'] h1 {
          font-size: 1.875rem;
          line-height: 2.25rem;
          font-weight: 700;
          color: rgb(255 255 255);
          margin-bottom: 1rem;
          margin-top: 1.5rem;
        }

        [contenteditable='true'] h2 {
          font-size: 1.5rem;
          line-height: 2rem;
          font-weight: 700;
          color: rgb(255 255 255);
          margin-bottom: 0.75rem;
          margin-top: 1.25rem;
        }

        [contenteditable='true'] h3 {
          font-size: 1.25rem;
          line-height: 1.75rem;
          font-weight: 600;
          color: rgb(255 255 255);
          margin-bottom: 0.5rem;
          margin-top: 1rem;
        }

        /* Style paragraphs */
        [contenteditable='true'] p {
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 1rem;
          line-height: 1.625;
        }

        [contenteditable='true'] p.is-editor-empty:first-child::before {
          color: rgba(255, 255, 255, 0.4);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }

        /* Style lists */
        [contenteditable='true'] ul,
        [contenteditable='true'] ol {
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 1rem;
          padding-left: 1.5rem;
        }

        [contenteditable='true'] li {
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 0.5rem;
        }

        /* Style blockquotes */
        [contenteditable='true'] blockquote {
          border-left: 4px solid rgba(255, 255, 255, 0.3);
          padding-left: 1rem;
          font-style: italic;
          color: rgba(255, 255, 255, 0.8);
          margin-top: 1rem;
          margin-bottom: 1rem;
        }

        /* Style code */
        [contenteditable='true'] code {
          background-color: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.9);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
        }

        [contenteditable='true'] pre {
          background-color: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.5rem;
          padding: 1rem;
          margin-top: 1rem;
          margin-bottom: 1rem;
          overflow-x: auto;
        }

        [contenteditable='true'] pre code {
          background-color: transparent;
          padding: 0;
        }

        /* Style links */
        [contenteditable='true'] a {
          color: rgb(196 181 253);
          text-decoration: underline;
          transition: color 0.15s ease-in-out;
        }

        [contenteditable='true'] a:hover {
          color: rgb(167 139 250);
        }

        /* Style images */
        [contenteditable='true'] img {
          border-radius: 0.5rem;
          margin-top: 1rem;
          margin-bottom: 1rem;
          max-width: 100%;
        }

        /* Style horizontal rules */
        [contenteditable='true'] hr {
          border-color: rgba(255, 255, 255, 0.1);
          margin-top: 1.5rem;
          margin-bottom: 1.5rem;
        }

        /* Style strong/em */
        [contenteditable='true'] strong {
          font-weight: 700;
          color: rgb(255 255 255);
        }

        [contenteditable='true'] em {
          font-style: italic;
          color: rgba(255, 255, 255, 0.9);
        }

        /* Selection color */
        [contenteditable='true'] ::selection {
          background-color: rgba(168, 85, 247, 0.3);
        }
      `}</style>
    </>
  );
}

