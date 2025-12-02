import { LLMGateway } from './llmGateway';

/**
 * Simplified, focused file summary structure
 * Only includes what's needed for documentation generation
 */
export type SimpleFileSummary = {
	summary: string; // 2-3 sentence human-readable summary
	purpose: string; // What problem does this file solve?
	mainExports: string[]; // Key exported functions/classes/types
	keyDependencies: string[]; // Top 5 most important imports
	fileType: 'component' | 'utility' | 'api' | 'config' | 'test' | 'other';
};

// Files that should be skipped entirely
const SKIP_FILE_PATTERNS = [
	/package-lock\.json$/i,
	/yarn\.lock$/i,
	/pnpm-lock\.yaml$/i,
	/composer\.lock$/i,
	/Gemfile\.lock$/i,
	/Cargo\.lock$/i,
	/poetry\.lock$/i,
	/Pipfile\.lock$/i,
	/shrinkwrap\.json$/i,
	/\.min\.(js|css)$/i,
	/\.bundle\.(js|css)$/i,
];

// Maximum file size (conservative limit for cost control)
const MAX_FILE_CHARS = 50000; // ~14k tokens, leaving room for prompt and output

/**
 * Generate a simple, focused file summary
 * Cost-effective and fast while maintaining accuracy
 */
export async function generateSimpleFileSummary(
	fileContent: string,
	filePath: string,
	model: string = 'gpt-4o-mini'
): Promise<SimpleFileSummary> {
	// Skip excluded files
	if (SKIP_FILE_PATTERNS.some(pattern => pattern.test(filePath))) {
		return {
			summary: `Auto-generated file (lock file or minified). Skipped from analysis.`,
			purpose: 'Auto-generated file',
			mainExports: [],
			keyDependencies: [],
			fileType: 'other',
		};
	}

	// Truncate very large files
	let contentToAnalyze = fileContent;
	if (fileContent.length > MAX_FILE_CHARS) {
		console.log(`[fileSummarizerSimple] File too large (${fileContent.length} chars), truncating: ${filePath}`);
		contentToAnalyze = fileContent.slice(0, MAX_FILE_CHARS) + '\n\n// ... [FILE TRUNCATED] ...';
	}

	let gateway: LLMGateway;
	try {
		gateway = new LLMGateway();
	} catch (error: any) {
		console.error(`[fileSummarizerSimple] ❌ LLM gateway initialization failed: ${error.message}`);
		throw new Error(`AI service unavailable: ${error.message}`);
	}

	// Simple, focused prompt
	const systemPrompt = `You are a code analyzer. Analyze the provided code file and extract key information concisely.

Return a JSON object with this exact structure:
{
  "summary": "A 2-3 sentence summary of what this file does and its main purpose",
  "purpose": "What specific problem or task does this file solve? Be specific.",
  "mainExports": ["list", "of", "exported", "functions", "classes", "or", "types"],
  "keyDependencies": ["top", "5", "most", "important", "imports", "or", "dependencies"],
  "fileType": "component|utility|api|config|test|other"
}

Be concise and accurate. Focus on understanding, not exhaustive detail.`;

	const userPrompt = `Analyze this file:

File path: ${filePath}

\`\`\`
${contentToAnalyze}
\`\`\`

Provide the JSON object as specified.`;

	let response: string | undefined;
	try {
		response = await gateway.call(
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt },
			],
			model,
			0.2 // Low temperature for consistent output
		);

		// Parse JSON response
		let jsonStr = response.trim();
		const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
		if (jsonMatch) {
			jsonStr = jsonMatch[1];
		}

		const parsed = JSON.parse(jsonStr) as SimpleFileSummary;

		// Validate and ensure all fields exist
		return {
			summary: parsed.summary || `File: ${filePath}`,
			purpose: parsed.purpose || 'Unknown purpose',
			mainExports: Array.isArray(parsed.mainExports) ? parsed.mainExports : [],
			keyDependencies: Array.isArray(parsed.keyDependencies) ? parsed.keyDependencies.slice(0, 5) : [],
			fileType: parsed.fileType || 'other',
		};
	} catch (error) {
		console.error(`[fileSummarizerSimple] Failed to parse summary for ${filePath}:`, error);
		console.error('Raw response:', response?.substring(0, 500));
		
		// Return a basic fallback
		return {
			summary: `File: ${filePath}. Unable to generate detailed summary.`,
			purpose: 'Unknown - parsing failed',
			mainExports: [],
			keyDependencies: [],
			fileType: 'other',
		};
	}
}

