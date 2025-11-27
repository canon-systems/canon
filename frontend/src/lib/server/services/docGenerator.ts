import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSystemPrompt, PromptConfig as PromptConfigType } from '../prompts/buildSystemPrompt';
import { analyzeRepository } from './analyzeRepository';
import { LLMGateway } from './llmGateway';

export type GenerateDocParams = {
	supabase: SupabaseClient;
	userId?: string | null;
	projectName?: string;
	model: string;
	files?: Array<{ path: string; content: string }>;
	repoUrl?: string | null;
	branch?: string | null;
	subdir?: string | null;
	promptConfig?: PromptConfigType | null;
};

export type GenerateDocResult = {
	markdown: string;
	model: string;
	promptConfig?: PromptConfigType | null;
};

export async function generateDocumentation(params: GenerateDocParams): Promise<GenerateDocResult> {
	const {
		supabase,
		userId,
		projectName = 'Project',
		model,
		files,
		repoUrl,
		branch,
		subdir,
		promptConfig,
	} = params;

	if (!model) {
		throw new Error('model is required for documentation generation');
	}

	let fileEntries = files || [];

	if (!fileEntries.length) {
		if (!repoUrl) {
			throw new Error('Either files or repoUrl must be provided');
		}

		const analysis = await analyzeRepository({
			supabase,
			userId: userId ?? '',
			repoUrl,
			branch: branch || undefined,
			subdir,
			filters: null,
		});

		fileEntries = analysis.rawFiles ?? [];
	}

	if (!fileEntries.length) {
		throw new Error('No files available to generate documentation');
	}

	const systemPrompt = buildSystemPrompt(promptConfig ?? null, false);

	const fileContent = fileEntries
		.map((file) => `--- FILE: ${file.path} ---\n${file.content}`)
		.join('\n\n');

	const userPrompt = `Project: ${projectName}\n\nFiles (${fileEntries.length}):\n${fileContent}`;

	const gateway = new LLMGateway();

	const markdown = await gateway.call(
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		],
		model,
		promptConfig?.temperature
	);

	return {
		markdown,
		model,
		promptConfig,
	};
}

