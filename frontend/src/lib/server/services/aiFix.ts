import type { SupabaseClient } from '@supabase/supabase-js';
import { LLMGateway } from './llmGateway';
import { extractSection, replaceSection } from './markdownUtils';

type AIFixParams = {
	supabase: SupabaseClient;
	userId: string;
	model: string;
	docId?: string | null;
	markdownContent?: string | null;
	section?: string | null;
	issue?: string | null;
	instruction?: string | null;
};

type AIFixResult = {
	markdown: string;
	fixed_section?: string | null;
};

export async function applyAIFixToDoc(params: AIFixParams): Promise<AIFixResult> {
	const { supabase, userId, model, docId, markdownContent, section, issue, instruction } = params;

	if (!model) {
		throw new Error('model is required for AI fix');
	}

	const currentMarkdown = await resolveMarkdown(supabase, docId, markdownContent);

	const promptDetails = buildAIFixPrompt(currentMarkdown, section, issue, instruction);

	const gateway = new LLMGateway();
	const improvedContent = await gateway.call(
		promptDetails.messages,
		model
	);

	let updatedMarkdown = improvedContent.trim();

	if (promptDetails.sectionToReplace) {
		const replaced = replaceSection(currentMarkdown, promptDetails.sectionToReplace, improvedContent);
		updatedMarkdown = replaced;
	}

	return {
		markdown: updatedMarkdown,
		fixed_section: promptDetails.sectionToReplace || null,
	};
}

export async function* streamAIFixToDoc(params: AIFixParams) {
	const { supabase, userId, model, docId, markdownContent, section, issue, instruction } = params;

	if (!model) {
		throw new Error('model is required for AI fix');
	}

	const currentMarkdown = await resolveMarkdown(supabase, docId, markdownContent);

	const promptDetails = buildAIFixPrompt(currentMarkdown, section, issue, instruction);

	const gateway = new LLMGateway();
	const stream = gateway.stream(promptDetails.messages, model);
	const accumulator: string[] = [];

	for await (const chunk of stream) {
		accumulator.push(chunk);
		const combined = accumulator.join('');
		if (promptDetails.sectionToReplace) {
			yield replaceSection(currentMarkdown, promptDetails.sectionToReplace, combined);
		} else {
			yield combined;
		}
	}
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

function buildAIFixPrompt(
	markdown: string,
	section?: string | null,
	issue?: string | null,
	instruction?: string | null
) {
	const messages = [
		{
			role: 'system',
			content:
				'You are a technical writing expert. Improve documentation for clarity, accuracy, and readability. Maintain the same structure and technical accuracy.',
		},
	];

	let sectionToReplace: string | null = null;
	let userContent = '';

	if (section && issue) {
		const existing = extractSection(markdown, section) || section;
		userContent = `Here is a section that needs improvement:\n\n${existing}\n\nIssue: ${issue}\n\nPlease rewrite this section to fix the issue. Keep the same heading level and return only the improved section text.`;
		sectionToReplace = section;
	} else if (instruction) {
		const target = section ? extractSection(markdown, section) : markdown;
		userContent = `Instruction: ${instruction}\n\n${target}`;
		if (section) sectionToReplace = section;
	} else {
		throw new Error("Either 'section' & 'issue' or 'instruction' must be provided");
	}

	messages.push({ role: 'user', content: userContent });

	return {
		messages,
		sectionToReplace,
	};
}

