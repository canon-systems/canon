<script lang="ts">
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import { Search, ChevronDown } from '@lucide/svelte';

	export let options: Array<{ value: string; label: string }> = [];
	export let value: string = '';
	export let placeholder: string = 'Select...';
	export let disabled: boolean = false;
	export let searchPlaceholder: string = 'Search...';

	let isOpen = false;
	let searchQuery = '';
	let dropdownRef: HTMLElement | null = null;

	const dispatch = createEventDispatcher();

	$: filteredOptions = options.filter(
		(opt) =>
			opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
			opt.value.toLowerCase().includes(searchQuery.toLowerCase())
	);

	$: selectedLabel = value
		? options.find((opt) => opt.value === value)?.label || value
		: placeholder;

	async function selectOption(optionValue: string, event?: MouseEvent) {
		if (event) {
			event.stopPropagation();
			event.preventDefault();
		}
		value = optionValue;
		searchQuery = '';
		isOpen = false;
		// Wait for state to update
		await tick();
		// Dispatch a custom event to close all other dropdowns
		window.dispatchEvent(new CustomEvent('closeAllDropdowns'));
		dispatch('change', { value: optionValue });
	}

	function handleClickOutside(event: MouseEvent) {
		if (isOpen && dropdownRef && !dropdownRef.contains(event.target as Node)) {
			isOpen = false;
			searchQuery = '';
		}
	}

	function handleCloseAllDropdowns() {
		if (isOpen) {
			isOpen = false;
			searchQuery = '';
		}
	}

	onMount(() => {
		// Always listen for the closeAllDropdowns event
		window.addEventListener('closeAllDropdowns', handleCloseAllDropdowns);

		return () => {
			window.removeEventListener('closeAllDropdowns', handleCloseAllDropdowns);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Reactive statement to manage click listener based on isOpen state
	$: if (isOpen) {
		document.addEventListener('click', handleClickOutside);
	} else {
		document.removeEventListener('click', handleClickOutside);
	}
</script>

<div class="relative" bind:this={dropdownRef}>
	<button
		type="button"
		on:click={() => {
			if (!disabled) {
				isOpen = !isOpen;
				if (isOpen) {
					searchQuery = '';
				}
			}
		}}
		{disabled}
		class="flex w-full items-center justify-between rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-white outline-none focus:border-white/40 focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
	>
		<span class={value ? 'text-white' : 'text-white/60'}>{selectedLabel}</span>
		<ChevronDown class="h-4 w-4 text-white/60" />
	</button>

	{#if isOpen && !disabled}
		<div
			class="absolute z-50 mt-1 max-h-64 w-full overflow-hidden rounded-lg border border-white/20 bg-gray-900 shadow-xl"
			on:click|stopPropagation
		>
			<!-- Search input -->
			<div class="sticky top-0 border-b border-white/10 bg-gray-900 p-2">
				<div class="relative">
					<Search class="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder={searchPlaceholder}
						class="w-full rounded bg-white/5 px-8 py-1.5 text-sm text-white placeholder-white/40 outline-none focus:bg-white/10"
						on:click|stopPropagation
					/>
				</div>
			</div>

			<!-- Options list -->
			<div class="max-h-48 overflow-auto">
				{#if filteredOptions.length === 0}
					<div class="px-3 py-2 text-sm text-white/60">No matches found</div>
				{:else}
					{#each filteredOptions as option}
						<button
							type="button"
							on:click={(e) => selectOption(option.value, e)}
							on:mousedown|preventDefault
							class="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 focus:bg-white/10 focus:outline-none {value ===
							option.value
								? 'bg-blue-500/20'
								: ''}"
						>
							{option.label}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
