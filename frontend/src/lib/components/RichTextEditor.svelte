<script lang="ts">
	// We use Svelte lifecycle and an event dispatcher to talk to the parent page.
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';

	// TipTap runtime Editor class; types are imported to keep TS strict.
	import type { JSONContent, Editor as EditorType } from '@tiptap/core';

	// Lucide icons so the toolbar matches your app’s iconography.
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

	// External props:
	// - initialHTML: starting HTML content for the editor (converted from Markdown by the parent)
	// - editable: allow toggling read-only vs editable state from the parent
	export let initialHTML: string = '';
	export let editable: boolean = true;

	// We emit a "change" event with HTML, JSON, and plain text on every update.
	const dispatch = createEventDispatcher<{
		change: { html: string; json: JSONContent; text: string };
	}>();

	// Editor instance reference; null before mount and after destroy.
	let editor: EditorType | null = null;

	// The contenteditable <div> we bind for TipTap to control.
	let el: HTMLDivElement | null = null;

	// Bump this on every transaction/selection change so Svelte re-evaluates
	// editor.isActive(...) and editor.can() in the toolbar (reactivity anchor).
	let _refresh = 0;

	// Small helper to build Tailwind classes for toolbar buttons with “active” styling.
	function btn(active = false) {
		return [
			'inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-sm',
			'transition-colors select-none',
			'border-white/10 text-white/90 bg-black/40 hover:bg-black/50',
			active ? 'bg-white/10 border-white/20' : ''
		].join(' ');
	}

	// Create the TipTap editor on the client (dynamic imports avoid SSR issues).
	onMount(async () => {
		const { Editor } = await import('@tiptap/core');
		const { default: StarterKit } = await import('@tiptap/starter-kit');
		const { default: UnderlineExt } = await import('@tiptap/extension-underline');
		const { default: LinkExt } = await import('@tiptap/extension-link');
		const { default: ImageExt } = await import('@tiptap/extension-image');
		const { default: TextAlignExt } = await import('@tiptap/extension-text-align');

		editor = new Editor({
			// Non-null assertion because Svelte binds el before onMount runs.
			element: el!,
			// Feature set; you can add more TipTap extensions here later (tables, tasks, etc.).
			extensions: [
				StarterKit,
				UnderlineExt,
				LinkExt.configure({ openOnClick: true, autolink: true, linkOnPaste: true }),
				ImageExt,
				TextAlignExt.configure({ types: ['heading', 'paragraph'] })
			],
			// Whether the user can type.
			editable,
			// Start with initialHTML or a single paragraph so the canvas is focusable.
			content: initialHTML || '<p></p>',
			// Emit changes upward and force Svelte to re-check toolbar active states.
			onUpdate: ({ editor }) => {
				const json = editor.getJSON() as JSONContent;
				dispatch('change', { html: editor.getHTML(), json, text: editor.getText() });
				_refresh++;
			},
			// Also bump on cursor or selection changes so buttons light up correctly.
			onSelectionUpdate: () => {
				_refresh++;
			}
		});
	});

	// React to prop changes: toggle editability if the parent flips it.
	$: if (editor) editor.setEditable(editable);

	// Dispose editor on unmount.
	onDestroy(() => {
		editor?.destroy();
		editor = null;
	});

	// Prompt for a URL and set/unset a link on the current selection.
	function setLink(): void {
		if (!editor) return;
		const url = prompt('Enter URL. Empty removes the link.');
		if (url === null) return; // user cancelled
		if (url === '') {
			editor.chain().focus().unsetLink().run();
			return;
		}
		editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
	}

	// Prompt for an image URL and insert an <img>.
	function insertImage(): void {
		if (!editor) return;
		const url = prompt('Paste image URL');
		if (!url) return;
		editor.chain().focus().setImage({ src: url }).run();
	}
</script>

<!-- Hidden anchor to ensure Svelte tracks _refresh reactivity for toolbar state -->
<span aria-hidden="true" class="hidden">{_refresh}</span>

<!--
  OUTER CONTAINER
  - Changed to "flex flex-col h-full" so this component fills its parent pane.
  - This lets the toolbar stay fixed at the top and the editor area scroll within.
-->
<div
	class="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-xl backdrop-blur-md"
>
	{#if editor}
		<!--
      TOOLBAR
      - Stays at natural height (no flex growth).
      - Gradient background and thin border to match your dark glassy UI.
    -->
		<div
			class="flex flex-wrap items-center gap-2 border-b border-white/10 bg-gradient-to-r from-gray-800/60 to-gray-900/60 p-3"
		>
			<!-- Undo / Redo -->
			<div class="flex items-center gap-2">
				<button
					type="button"
					class={btn()}
					title="Undo"
					on:click={() => editor?.chain().focus().undo().run()}
					disabled={!editor?.can().undo()}
				>
					<RotateCcw class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn()}
					title="Redo"
					on:click={() => editor?.chain().focus().redo().run()}
					disabled={!editor?.can().redo()}
				>
					<RotateCw class="h-4 w-4" />
				</button>
			</div>

			<div class="mx-1 h-5 w-px bg-white/10" />

			<!-- Paragraph and Headings -->
			<div class="flex items-center gap-2">
				<button
					type="button"
					class={btn(editor.isActive('paragraph'))}
					title="Paragraph"
					on:click={() => editor?.chain().focus().setParagraph().run()}
				>
					<Pilcrow class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('heading', { level: 1 }))}
					title="Heading 1"
					on:click={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
				>
					<Heading1 class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('heading', { level: 2 }))}
					title="Heading 2"
					on:click={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
				>
					<Heading2 class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('heading', { level: 3 }))}
					title="Heading 3"
					on:click={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
				>
					<Heading3 class="h-4 w-4" />
				</button>
			</div>

			<div class="mx-1 h-5 w-px bg-white/10" />

			<!-- Inline formatting -->
			<div class="flex items-center gap-2">
				<button
					type="button"
					class={btn(editor.isActive('bold'))}
					title="Bold"
					on:click={() => editor?.chain().focus().toggleBold().run()}
				>
					<Bold class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('italic'))}
					title="Italic"
					on:click={() => editor?.chain().focus().toggleItalic().run()}
				>
					<Italic class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('underline'))}
					title="Underline"
					on:click={() => editor?.chain().focus().toggleUnderline().run()}
				>
					<Underline class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('strike'))}
					title="Strikethrough"
					on:click={() => editor?.chain().focus().toggleStrike().run()}
				>
					<Strikethrough class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('code'))}
					title="Inline code"
					on:click={() => editor?.chain().focus().toggleCode().run()}
				>
					<CodeIcon class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('link'))}
					title="Insert or edit link"
					on:click={setLink}
				>
					<LinkIcon class="h-4 w-4" />
				</button>
			</div>

			<div class="mx-1 h-5 w-px bg-white/10" />

			<!-- Lists and blocks -->
			<div class="flex items-center gap-2">
				<button
					type="button"
					class={btn(editor.isActive('bulletList'))}
					title="Bullet list"
					on:click={() => editor?.chain().focus().toggleBulletList().run()}
				>
					<ListBullets class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('orderedList'))}
					title="Numbered list"
					on:click={() => editor?.chain().focus().toggleOrderedList().run()}
				>
					<ListOrdered class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('blockquote'))}
					title="Blockquote"
					on:click={() => editor?.chain().focus().toggleBlockquote().run()}
				>
					<Quote class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive('codeBlock'))}
					title="Code block"
					on:click={() => editor?.chain().focus().toggleCodeBlock().run()}
				>
					<SquareCode class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn()}
					title="Horizontal rule"
					on:click={() => editor?.chain().focus().setHorizontalRule().run()}
				>
					<Minus class="h-4 w-4" />
				</button>
			</div>

			<div class="mx-1 h-5 w-px bg-white/10" />

			<!-- Alignment -->
			<div class="flex items-center gap-2">
				<button
					type="button"
					class={btn(editor.isActive({ textAlign: 'left' }))}
					title="Align left"
					on:click={() => editor?.chain().focus().setTextAlign('left').run()}
				>
					<AlignLeft class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive({ textAlign: 'center' }))}
					title="Align center"
					on:click={() => editor?.chain().focus().setTextAlign('center').run()}
				>
					<AlignCenter class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive({ textAlign: 'right' }))}
					title="Align right"
					on:click={() => editor?.chain().focus().setTextAlign('right').run()}
				>
					<AlignRight class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={btn(editor.isActive({ textAlign: 'justify' }))}
					title="Justify"
					on:click={() => editor?.chain().focus().setTextAlign('justify').run()}
				>
					<AlignJustify class="h-4 w-4" />
				</button>
			</div>

			<div class="mx-1 h-5 w-px bg-white/10" />

			<!-- Images -->
			<div class="flex items-center gap-2">
				<button type="button" class={btn()} title="Insert image (URL)" on:click={insertImage}>
					<ImageIcon class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/if}

	<!--
    EDITOR CANVAS
    - Key change: "flex-1 overflow-y-auto" so this area expands to fill
      remaining height and scrolls independently when content is long.
    - Border connects visually with the toolbar via border-top.
  -->
	<div
		class="flex-1 overflow-y-auto border-t border-white/10 bg-black/30 p-6 text-white ring-white/20 focus-within:ring-2"
		bind:this={el}
		contenteditable="true"
	/>
</div>
