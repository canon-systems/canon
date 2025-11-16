/**
 * Build system prompt for LLM based on customization settings
 */

export interface PromptConfig {
	personality?: string;
	style?: string;
	customInstructions?: string;
	temperature?: number;
}

/**
 * Build the system prompt message based on prompt configuration
 */
export function buildSystemPrompt(
	config: PromptConfig | null | undefined,
	isUpdate: boolean = false
): string {
	const basePrompt = isUpdate
		? [
				'You are a senior technical writer.',
				'You are updating existing documentation. The source code has changed, and you need to update the documentation accordingly.',
				'Maintain the same structure and style as much as possible, but reflect all code changes accurately.'
		  ]
		: [
				'You are a senior technical writer.',
				'Produce clear, well-structured Markdown documentation for the given codebase.'
		  ];

	// Add personality
	const personalityMap: Record<string, string> = {
		friendly: 'Write in a friendly, approachable tone. Be warm and welcoming to readers.',
		concise: 'Be concise and direct. Get to the point quickly without unnecessary elaboration.',
		detailed: 'Be thorough and detailed. Provide comprehensive explanations and context.',
		conversational: 'Write in a conversational style, as if explaining to a colleague.',
		formal: 'Write in a formal, academic style with precise language and structure.',
		default: '' // No additional personality instruction
	};

	if (config?.personality && config.personality !== 'default') {
		const personalityInstruction = personalityMap[config.personality] || '';
		if (personalityInstruction) {
			basePrompt.push(personalityInstruction);
		}
	}

	// Add style
	const styleMap: Record<string, string> = {
		'beginner-friendly': 'Write for beginners. Explain concepts clearly, avoid jargon, and provide examples.',
		'expert-level': 'Write for experts. Assume deep technical knowledge and focus on advanced details.',
		tutorial: 'Write in a tutorial style with step-by-step guidance and practical examples.',
		reference: 'Write as a reference manual with clear sections, organized information, and quick lookup format.',
		'blog-post': 'Write in an engaging blog post style with narrative flow and storytelling elements.',
		default: '' // No additional style instruction
	};

	if (config?.style && config.style !== 'default') {
		const styleInstruction = styleMap[config.style] || '';
		if (styleInstruction) {
			basePrompt.push(styleInstruction);
		}
	}

	// Add standard requirements
	basePrompt.push(
		'Include: overview, key components, data flow, API/CLI usage (if any), setup/run, and limitations.',
		'When helpful, include short code snippets or pseudo-diagrams.',
		'Use headings, subheadings, and bullet points. No HTML.'
	);

	// Add custom instructions if provided
	if (config?.customInstructions?.trim()) {
		basePrompt.push(`Additional instructions: ${config.customInstructions.trim()}`);
	}

	return basePrompt.join(' ');
}

