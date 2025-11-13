<script lang="ts">
	import { page } from '$app/stores';

	const tabs = [
		{ name: 'Submit', href: '/submit' },
		{ name: 'Edit', href: '/edit' }
	];

	function isActive(currentPath: string, href: string) {
		// Treat /edit and /edit/[id] as active when you're anywhere under /edit
		if (href === '/edit' && currentPath.startsWith('/edit')) return true;
		return currentPath === href;
	}
</script>

<nav class="z-10 border-b border-white/10 bg-black/20">
	<div class="mx-auto flex h-12 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
		{#each tabs as t}
			<a
				href={t.href}
				class={`rounded-full px-3 py-1.5 text-sm transition hover:bg-white/15 ${
					isActive($page.url.pathname, t.href) ? 'bg-white/15' : 'bg-white/5'
				}`}
				aria-current={isActive($page.url.pathname, t.href) ? 'page' : undefined}
			>
				{t.name}
			</a>
		{/each}
	</div>
</nav>
