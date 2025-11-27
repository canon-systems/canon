import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMarkdown, rebuildMarkdown } from './markdownUtils';

type TemplateParams = {
	supabase: SupabaseClient;
	userId: string;
	docId?: string | null;
	markdownContent?: string | null;
	templateId?: string | null;
	templateContent?: string | null;
};

type TemplateResult = {
	markdown: string;
	template_applied: string;
	changes_summary: string;
};

export async function applyTemplateToDoc(params: TemplateParams): Promise<TemplateResult> {
	const {
		supabase,
		docId,
		markdownContent,
		templateId,
		templateContent,
	} = params;

	const currentMarkdown = await resolveMarkdown(supabase, docId, markdownContent);

	const resolvedTemplate = templateContent || getPredefinedTemplate(templateId) || getDefaultTemplate();

	const docStructure = parseMarkdown(currentMarkdown);
	const transformed = applyTemplateStructure(docStructure, resolvedTemplate);

	const newMarkdown = rebuildMarkdown(transformed);

	const changesSummary = generateChangesSummary(currentMarkdown, newMarkdown);

	return {
		markdown: newMarkdown,
		template_applied: templateId || 'default',
		changes_summary: changesSummary,
	};
}

async function resolveMarkdown(
	supabase: SupabaseClient,
	docId?: string | null,
	markdownContent?: string | null
): Promise<string> {
	if (markdownContent) {
		return markdownContent;
	}

	if (!docId) {
		throw new Error('Either docId or markdownContent must be provided');
	}

	const submission = await supabase
		.from('submissions')
		.select('markdown')
		.eq('id', docId)
		.single();

	if (!submission || !submission.data?.markdown) {
		throw new Error('Document not found');
	}

	return submission.data.markdown;
}

function getPredefinedTemplate(templateId?: string | null): string | null {
	const templates: Record<string, string> = {
		minimal: `
# {TITLE}

## Overview
{OVERVIEW}

## Usage
{USAGE}
`,
		comprehensive: `
# {TITLE}

## Overview
{OVERVIEW}

## Installation
{INSTALLATION}

## Usage
{USAGE}

## API Reference
{API_REFERENCE}

## Examples
{EXAMPLES}

## Contributing
{CONTRIBUTING}
`,
		'api-docs': `
# {TITLE} API Documentation

## Overview
{OVERVIEW}

## Authentication
{AUTHENTICATION}

## Endpoints
{ENDPOINTS}

## Request/Response Examples
{EXAMPLES}

## Error Codes
{ERROR_CODES}
`,
	};

	return templateId ? templates[templateId] || null : null;
}

function getDefaultTemplate(): string {
	return `
# {TITLE}

## Overview
{OVERVIEW}

## Key Components
{COMPONENTS}

## Usage
{USAGE}

## API/CLI
{API}

## Setup/Run
{SETUP}

## Limitations
{LIMITATIONS}
`;
}

function applyTemplateStructure(docStructure: ReturnType<typeof parseMarkdown>, template: string) {
	const sectionsMap = new Map<string, ReturnType<typeof parseMarkdown>[number]>();
	docStructure.forEach((section) => {
		sectionsMap.set(section.title.toLowerCase(), section);
	});

	const placeholders = Array.from(new Set(Array.from(template.matchAll(/\{([A-Z_]+)\}/g)).map((match) => match[1])));

	const transformedSections = placeholders
		.map((placeholder) => {
			const normalized = placeholder.toLowerCase().replace(/_/g, ' ');
			const matched = Array.from(sectionsMap.values()).find((section) =>
				section.title.toLowerCase().includes(normalized)
			);

			if (!matched) return null;

			return {
				title: sectionTitleForPlaceholder(matched.title, placeholder),
				level: matched.level,
				content: matched.content,
			};
		})
		.filter((section): section is NonNullable<typeof section> => section !== null);

	return transformedSections.length
		? transformedSections
		: docStructure;
}

function sectionTitleForPlaceholder(originalTitle: string, placeholder: string): string {
	if (placeholder.includes('OVERVIEW')) {
		return originalTitle;
	}
	return originalTitle;
}

function generateChangesSummary(oldMarkdown: string, newMarkdown: string): string {
	const oldSections = (oldMarkdown.match(/^#+\s+/gm) || []).length;
	const newSections = (newMarkdown.match(/^#+\s+/gm) || []).length;

	if (oldSections !== newSections) {
		return `Reorganized from ${oldSections} to ${newSections} sections`;
	}

	return 'Template applied with structure adjustments';
}

