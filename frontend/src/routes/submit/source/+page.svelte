<script lang="ts">
	// We import SvelteKit enhance so the page updates without a full reload after submit.
	import { enhance } from '$app/forms';

	// SvelteKit injects a "form" prop after an action runs. It contains whatever we return in the action.
	export let form: any;

	// Local state for which source type is currently selected.
	// We keep it as a union of four strings or null before selection.
	type SourceType = 'github' | 'git_subdir' | 'zip' | 'snippet' | null;
	let selected: SourceType = null;

	// Local state for inputs. This keeps the fields controlled and easy to reset.
	let inputs = {
		repoUrl: '', // Git repo URL
		branch: '', // Optional branch or tag or commit
		subdir: '', // Subdirectory path when user chooses Git subdir
		snippet: '' // Pasted code
		// The file is not stored here because file inputs are best read directly by the browser during submit
	};

	// A simple reset helper so the user can go back and pick a different source type
	function resetAll() {
		selected = null;
		inputs = { repoUrl: '', branch: '', subdir: '', snippet: '' };
	}
</script>

<!--
  Outer container with a centered max width.
  Tailwind handles spacing, borders, colors, and layout.
-->
<div class="mx-auto max-w-3xl p-6">
	<!-- Header so the user knows what this page does -->
	<h1 class="mb-2 text-3xl font-bold text-white">Connect a source</h1>
	<p class="mb-8 text-white/80">
		Choose one source type. Fill the fields. Submit to send inputs to the server for validation.
	</p>

	<!-- Card that lets the user pick a source type -->
	<div class="mb-6 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
		<h2 class="mb-2 block text-sm font-medium text-white">Source type</h2>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<button
				class="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left text-white hover:bg-white/20"
				on:click={() => (selected = 'github')}
			>
				<div class="font-semibold">GitHub repository</div>
				<div class="text-xs text-white/70">Analyze a whole repo</div>
			</button>

			<button
				class="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left text-white hover:bg-white/20"
				on:click={() => (selected = 'git_subdir')}
			>
				<div class="font-semibold">Git subdirectory</div>
				<div class="text-xs text-white/70">Focus on a folder inside a repo</div>
			</button>

			<button
				class="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left text-white hover:bg-white/20"
				on:click={() => (selected = 'zip')}
			>
				<div class="font-semibold">ZIP upload</div>
				<div class="text-xs text-white/70">Upload a .zip file of your code</div>
			</button>

			<button
				class="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left text-white hover:bg-white/20"
				on:click={() => (selected = 'snippet')}
			>
				<div class="font-semibold">Pasted code</div>
				<div class="text-xs text-white/70">Paste code directly</div>
			</button>
		</div>
	</div>

	{#if selected}
		<!-- Back button so the user can switch types quickly -->
		<div class="mb-4">
			<button
				class="rounded border border-white/30 bg-white/10 px-3 py-2 text-white hover:bg-white/20"
				on:click={resetAll}
			>
				Back to source type picker
			</button>
		</div>
	{/if}

	<!--
    The form posts to the default action in +page.server.ts.
    We set enctype multipart so the ZIP upload works.
    We use enhance so the result appears in this same page as the 'form' prop.
  -->
	<form
		method="post"
		enctype="multipart/form-data"
		use:enhance
		class="space-y-5 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur"
	>
		<!-- Hidden field to tell the server which branch to run -->
		{#if selected}
			<input type="hidden" name="sourceType" value={selected} />
		{/if}

		<!-- GitHub repository fields -->
		{#if selected === 'github'}
			<div>
				<h2 class="mb-1 block text-sm font-medium text-white">Repository URL</h2>
				<input
					name="repoUrl"
					class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 text-white placeholder:text-white/50"
					placeholder="https://github.com/owner/repo"
					bind:value={inputs.repoUrl}
					required
				/>
			</div>

			<div>
				<h2 class="mb-1 block text-sm font-medium text-white">Branch or tag or commit</h2>
				<input
					name="branch"
					class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 text-white placeholder:text-white/50"
					placeholder="main"
					bind:value={inputs.branch}
					required
				/>
			</div>
		{/if}

		<!-- Git subdirectory fields -->
		{#if selected === 'git_subdir'}
			<div>
				<h2 class="mb-1 block text-sm font-medium text-white">Repository URL</h2>
				<input
					name="repoUrl"
					class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 text-white placeholder:text-white/50"
					placeholder="https://github.com/owner/repo"
					bind:value={inputs.repoUrl}
					required
				/>
			</div>

			<div>
				<h2 class="mb-1 block text-sm font-medium text-white">Branch or tag or commit</h2>
				<input
					name="branch"
					class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 text-white placeholder:text-white/50"
					placeholder="main"
					bind:value={inputs.branch}
					required
				/>
			</div>

			<div>
				<h2 class="mb-1 block text-sm font-medium text-white">Subdirectory path</h2>
				<input
					name="subdir"
					class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 text-white placeholder:text-white/50"
					placeholder="e.g. src or apps/web"
					bind:value={inputs.subdir}
					required
				/>
			</div>
		{/if}

		<!-- ZIP upload fields -->
		{#if selected === 'zip'}
			<div>
				<h2 class="mb-1 block text-sm font-medium text-white">Upload a .zip file</h2>
				<input
					name="zipFile"
					type="file"
					accept=".zip"
					class="block w-full rounded border border-white/30 bg-white/10 px-3 py-2 text-white file:mr-3 file:rounded-md file:border-0 file:bg-white/20 file:px-3 file:py-2 file:text-white"
					required
				/>
			</div>
			<p class="text-xs text-white/60">You can add support for a zip URL later if you like.</p>
		{/if}

		<!-- Code snippet fields -->
		{#if selected === 'snippet'}
			<div>
				<h2 class="mb-1 block text-sm font-medium text-white">Code snippet</h2>
				<textarea
					name="snippet"
					rows="10"
					class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 font-mono text-sm text-white placeholder:text-white/50"
					placeholder="// paste code here"
					bind:value={inputs.snippet}
					required
				></textarea>
			</div>
		{/if}

		<!-- Submit button. Disabled until a type is chosen. -->
		<button
			type="submit"
			class="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 py-3 font-medium text-white hover:from-purple-600 hover:to-pink-600 disabled:opacity-60"
			disabled={!selected}
		>
			Submit
		</button>

		<!-- Server result panel. Shows only when the action returns data. -->
		{#if form?.ok}
			<div class="rounded-xl border border-emerald-300/40 bg-emerald-500/20 p-4 text-white">
				<div class="font-semibold">Inputs received</div>
				<p class="text-sm opacity-80">This is an echo from the server so you can verify values.</p>
				<pre class="mt-2 overflow-auto rounded bg-black/30 p-3 text-xs">{JSON.stringify(
						form.echo,
						null,
						2
					)}</pre>
				<div class="mt-4 rounded-xl border border-white/20 bg-white/10 p-3 text-white">
					<div class="text-sm">
						<span class="opacity-80">Workflow</span>
						<span class="mx-1">•</span>
						<span class="font-semibold">{form.orkes.name} v{form.orkes.version}</span>
					</div>
					<div class="mt-1 text-xs opacity-80">Execution ID: {form.orkes.workflowId}</div>
				</div>
			</div>
		{/if}

		{#if form?.error}
			<div class="rounded-xl border border-red-300/50 bg-red-500/20 p-4 text-white">
				<div class="font-semibold">There was a problem</div>
				<p class="mt-1 text-sm opacity-80">{form.error}</p>
			</div>
		{/if}
	</form>
</div>
