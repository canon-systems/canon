<!-- Integration Brand Logos using Simple Icons -->
<script lang="ts">
	import * as simpleIcons from 'simple-icons';

	export let size: number = 24;
	export let provider: 'notion' | 'slack' | 'confluence' | 'google-docs' | 'googledocs' | 'jira';

	// Map provider names to simple-icons export names
	const iconMap: Record<string, keyof typeof simpleIcons> = {
		'notion': 'siNotion',
		'slack': 'siSlack',
		'confluence': 'siConfluence',
		'google-docs': 'siGoogledocs',
		'googledocs': 'siGoogledocs', // Also support the database format
		'jira': 'siJira'
	};

	$: iconKey = iconMap[provider] || 'siNotion';
	$: icon = simpleIcons[iconKey] as { title: string; hex: string; path: string };
</script>

{@html `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" title="${icon.title}">
	<path d="${icon.path}" fill="#${icon.hex}"/>
</svg>`}

