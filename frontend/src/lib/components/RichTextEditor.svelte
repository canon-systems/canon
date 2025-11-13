<script lang="ts">
	// Svelte lifecycle and event dispatcher
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';

	// Types only (no runtime footprint)
	import type { JSONContent, Editor as EditorType } from '@tiptap/core';

	// lucide icons to match your UI
	import {
		RotateCcw,
		RotateCw,
		Pilcrow,
		Heading1,
		Heading2,
		Heading3,
		Bold,
		Italic,
		Underline,
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
		Image as ImageIcon
	} from '@lucide/svelte';

	// Props: starting HTML content and editability
	export let initialHTML: string = '';
	export let editable: boolean = true;

	// We emit:
	// - "change": latest { html, json, text }
	// - "cursor": { ratio } for scroll-sync (0 top .. 1 bottom)
	const dispatch = createEventDispatcher<{
		change: { html: string; json: JSONContent; text: string };
		cursor: { ratio: number };
	}>();

	// TipTap editor instance (null until mounted)
	let editor: EditorType | null = null;

	// The scrollable contenteditable element controlled by TipTap
	let el: HTMLDivElement | null = null;

	// Used to force Svelte to re-evaluate button active/disabled states
	let _refresh = 0;

	// Toolbar button classes; add a subtle "active" fill when a mark/node is active
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

	// Clamp helper for 0..1
	const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

	// Emit a normalized ratio based on caret position within the scroll area
	function emitCursorRatioFromSelection(): void {
		if (!editor || !el) return;

		const pos = editor.state.selection.$anchor.pos;
		const caret = editor.view.coordsAtPos(pos); // caret viewport coords
		const elRect = el.getBoundingClientRect(); // editor viewport box
		const caretYInEl = caret.top - elRect.top + el.scrollTop;

		const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
		const ratio = clamp(caretYInEl / maxScroll, 0, 1);
		dispatch('cursor', { ratio });
	}

	// Emit a ratio purely from scrollTop, used when user scrolls with the wheel/trackpad
	function emitCursorRatioFromScroll(): void {
		if (!el) return;
		const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
		const ratio = clamp(el.scrollTop / maxScroll, 0, 1);
		dispatch('cursor', { ratio });
	}

	// Initialize TipTap on the client only
	onMount(async () => {
		// Dynamic imports prevent SSR issues
		const { Editor } = await import('@tiptap/core');
		const { default: StarterKit } = await import('@tiptap/starter-kit');
		const { default: UnderlineExt } = await import('@tiptap/extension-underline');
		const { default: LinkExt } = await import('@tiptap/extension-link');
		const { default: ImageExt } = await import('@tiptap/extension-image');
		const { default: TextAlignExt } = await import('@tiptap/extension-text-align');

		editor = new Editor({
			element: el!, // contenteditable div
			extensions: [
				StarterKit,
				UnderlineExt,
				LinkExt.configure({ openOnClick: true, autolink: true, linkOnPaste: true }),
				ImageExt,
				TextAlignExt.configure({ types: ['heading', 'paragraph'] })
			],
			editable,
			content: initialHTML || '<p></p>',
			onUpdate: ({ editor }) => {
				const json = editor.getJSON() as JSONContent;
				// send latest content up
				dispatch('change', { html: editor.getHTML(), json, text: editor.getText() });
				// re-check toolbar states
				_refresh++;
				// keep preview near caret when content changes
				emitCursorRatioFromSelection();
			},
			onSelectionUpdate: () => {
				_refresh++;
				// keep preview near caret when cursor moves
				emitCursorRatioFromSelection();
			}
		});

		// Also sync on manual scrolls
		el!.addEventListener('scroll', emitCursorRatioFromScroll, { passive: true });
	});

	// React to external editability changes
	$: if (editor) editor.setEditable(editable);

	// Clean up
	onDestroy(() => {
		if (el) el.removeEventListener('scroll', emitCursorRatioFromScroll);
		editor?.destroy();
		editor = null;
	});

	// Prompt user for link URL
	function setLink(): void {
		if (!editor) return;
		const url = prompt('Enter URL. Empty removes the link.');
		if (url === null) return;
		if (url === '') {
			editor.chain().focus().unsetLink().run();
			return;
		}
		editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
	}

	// Prompt for image URL and insert
	function insertImage(): void {
		if (!editor) return;
		const url = prompt('Paste image URL');
		if (!url) return;
		editor.chain().focus().setImage({ src: url }).run();
	}
</script>

<!-- Anchor to ensure Svelte tracks reactivity for toolbar state -->
<span aria-hidden="true" class="hidden">{_refresh}</span>

<!--
  OUTER CONTAINER
  - flex flex-col so toolbar stays fixed and canvas below scrolls
  - h-full so it fills the parent 50% column in the page layout
-->
<div
	class="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-lg backdrop-blur-md"
>
	<!--
    TOOLBAR
    - Always render it so it never "disappears" between mounts.
    - Buttons are disabled until editor is ready.
  -->
	<div
		class="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/30 p-3 backdrop-blur-sm"
	>
		<!-- Undo / Redo -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				class={btn(false, !editor?.can().undo())}
				title="Undo"
				on:click={() => editor?.chain().focus().undo().run()}
				disabled={!editor?.can().undo()}
			>
				<RotateCcw class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(false, !editor?.can().redo())}
				title="Redo"
				on:click={() => editor?.chain().focus().redo().run()}
				disabled={!editor?.can().redo()}
			>
				<RotateCw class="h-4 w-4" />
			</button>
		</div>

		<div class="mx-1 h-6 w-px bg-white/10"></div>

		<!-- Paragraph + Headings -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				class={btn(editor?.isActive('paragraph'), !editor)}
				title="Paragraph"
				on:click={() => editor?.chain().focus().setParagraph().run()}
				disabled={!editor}
			>
				<Pilcrow class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('heading', { level: 1 }), !editor)}
				title="Heading 1"
				on:click={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
				disabled={!editor}
			>
				<Heading1 class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('heading', { level: 2 }), !editor)}
				title="Heading 2"
				on:click={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
				disabled={!editor}
			>
				<Heading2 class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('heading', { level: 3 }), !editor)}
				title="Heading 3"
				on:click={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
				disabled={!editor}
			>
				<Heading3 class="h-4 w-4" />
			</button>
		</div>

		<div class="mx-1 h-6 w-px bg-white/10"></div>

		<!-- Inline formatting -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				class={btn(editor?.isActive('bold'), !editor)}
				title="Bold"
				on:click={() => editor?.chain().focus().toggleBold().run()}
				disabled={!editor}
			>
				<Bold class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('italic'), !editor)}
				title="Italic"
				on:click={() => editor?.chain().focus().toggleItalic().run()}
				disabled={!editor}
			>
				<Italic class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('underline'), !editor)}
				title="Underline"
				on:click={() => editor?.chain().focus().toggleUnderline().run()}
				disabled={!editor}
			>
				<Underline class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('strike'), !editor)}
				title="Strikethrough"
				on:click={() => editor?.chain().focus().toggleStrike().run()}
				disabled={!editor}
			>
				<Strikethrough class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('code'), !editor)}
				title="Inline code"
				on:click={() => editor?.chain().focus().toggleCode().run()}
				disabled={!editor}
			>
				<CodeIcon class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('link'), !editor)}
				title="Insert or edit link"
				on:click={setLink}
				disabled={!editor}
			>
				<LinkIcon class="h-4 w-4" />
			</button>
		</div>

		<div class="mx-1 h-6 w-px bg-white/10"></div>

		<!-- Lists and blocks -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				class={btn(editor?.isActive('bulletList'), !editor)}
				title="Bullet list"
				on:click={() => editor?.chain().focus().toggleBulletList().run()}
				disabled={!editor}
			>
				<ListBullets class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('orderedList'), !editor)}
				title="Numbered list"
				on:click={() => editor?.chain().focus().toggleOrderedList().run()}
				disabled={!editor}
			>
				<ListOrdered class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('blockquote'), !editor)}
				title="Blockquote"
				on:click={() => editor?.chain().focus().toggleBlockquote().run()}
				disabled={!editor}
			>
				<Quote class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive('codeBlock'), !editor)}
				title="Code block"
				on:click={() => editor?.chain().focus().toggleCodeBlock().run()}
				disabled={!editor}
			>
				<SquareCode class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(false, !editor)}
				title="Horizontal rule"
				on:click={() => editor?.chain().focus().setHorizontalRule().run()}
				disabled={!editor}
			>
				<Minus class="h-4 w-4" />
			</button>
		</div>

		<div class="mx-1 h-6 w-px bg-white/10"></div>

		<!-- Alignment -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				class={btn(editor?.isActive({ textAlign: 'left' }), !editor)}
				title="Align left"
				on:click={() => editor?.chain().focus().setTextAlign('left').run()}
				disabled={!editor}
			>
				<AlignLeft class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive({ textAlign: 'center' }), !editor)}
				title="Align center"
				on:click={() => editor?.chain().focus().setTextAlign('center').run()}
				disabled={!editor}
			>
				<AlignCenter class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive({ textAlign: 'right' }), !editor)}
				title="Align right"
				on:click={() => editor?.chain().focus().setTextAlign('right').run()}
				disabled={!editor}
			>
				<AlignRight class="h-4 w-4" />
			</button>
			<button
				type="button"
				class={btn(editor?.isActive({ textAlign: 'justify' }), !editor)}
				title="Justify"
				on:click={() => editor?.chain().focus().setTextAlign('justify').run()}
				disabled={!editor}
			>
				<AlignJustify class="h-4 w-4" />
			</button>
		</div>

		<div class="mx-1 h-6 w-px bg-white/10"></div>

		<!-- Images -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				class={btn(false, !editor)}
				title="Insert image (URL)"
				on:click={insertImage}
				disabled={!editor}
			>
				<ImageIcon class="h-4 w-4" />
			</button>
		</div>
	</div>

	<!--
    EDITOR CANVAS
    - flex-1 makes it fill remaining height
    - overflow-y-auto gives the editor its own scrollbar
    - on:scroll is a fallback that also triggers preview sync
  -->
	<div
		class="prose prose-invert max-w-none flex-1 overflow-y-auto border-t border-white/10 bg-white/5 p-6 text-white transition-colors focus-within:bg-white/10"
		bind:this={el}
		on:scroll={emitCursorRatioFromScroll}
		contenteditable="true"
	></div>
</div>

<style>
	/* TipTap editor content styling to match app design */
	:global([contenteditable='true']) {
		outline: none;
	}

	:global([contenteditable='true']:focus) {
		outline: none;
	}

	/* Style headings */
	:global([contenteditable='true'] h1) {
		font-size: 1.875rem;
		line-height: 2.25rem;
		font-weight: 700;
		color: rgb(255 255 255);
		margin-bottom: 1rem;
		margin-top: 1.5rem;
	}

	:global([contenteditable='true'] h2) {
		font-size: 1.5rem;
		line-height: 2rem;
		font-weight: 700;
		color: rgb(255 255 255);
		margin-bottom: 0.75rem;
		margin-top: 1.25rem;
	}

	:global([contenteditable='true'] h3) {
		font-size: 1.25rem;
		line-height: 1.75rem;
		font-weight: 600;
		color: rgb(255 255 255);
		margin-bottom: 0.5rem;
		margin-top: 1rem;
	}

	/* Style paragraphs */
	:global([contenteditable='true'] p) {
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 1rem;
		line-height: 1.625;
	}

	:global([contenteditable='true'] p.is-editor-empty:first-child::before) {
		color: rgba(255, 255, 255, 0.4);
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
	}

	/* Style lists */
	:global([contenteditable='true'] ul),
	:global([contenteditable='true'] ol) {
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 1rem;
		padding-left: 1.5rem;
	}

	:global([contenteditable='true'] li) {
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 0.5rem;
	}

	/* Style blockquotes */
	:global([contenteditable='true'] blockquote) {
		border-left: 4px solid rgba(255, 255, 255, 0.3);
		padding-left: 1rem;
		font-style: italic;
		color: rgba(255, 255, 255, 0.8);
		margin-top: 1rem;
		margin-bottom: 1rem;
	}

	/* Style code */
	:global([contenteditable='true'] code) {
		background-color: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-size: 0.875rem;
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
	}

	:global([contenteditable='true'] pre) {
		background-color: rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		padding: 1rem;
		margin-top: 1rem;
		margin-bottom: 1rem;
		overflow-x: auto;
	}

	:global([contenteditable='true'] pre code) {
		background-color: transparent;
		padding: 0;
	}

	/* Style links */
	:global([contenteditable='true'] a) {
		color: rgb(196 181 253);
		text-decoration: underline;
		transition: color 0.15s ease-in-out;
	}

	:global([contenteditable='true'] a:hover) {
		color: rgb(167 139 250);
	}

	/* Style images */
	:global([contenteditable='true'] img) {
		border-radius: 0.5rem;
		margin-top: 1rem;
		margin-bottom: 1rem;
		max-width: 100%;
	}

	/* Style horizontal rules */
	:global([contenteditable='true'] hr) {
		border-color: rgba(255, 255, 255, 0.1);
		margin-top: 1.5rem;
		margin-bottom: 1.5rem;
	}

	/* Style strong/em */
	:global([contenteditable='true'] strong) {
		font-weight: 700;
		color: rgb(255 255 255);
	}

	:global([contenteditable='true'] em) {
		font-style: italic;
		color: rgba(255, 255, 255, 0.9);
	}

	/* Selection color */
	:global([contenteditable='true'] ::selection) {
		background-color: rgba(168, 85, 247, 0.3);
	}
</style>
