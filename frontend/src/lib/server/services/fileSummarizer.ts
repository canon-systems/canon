import { LLMGateway } from './llmGateway';

export type FileSummary = {
	summary_text: string;
	resources: string;
};

let cachedGateway: LLMGateway | null = null;

function getGateway(): LLMGateway {
	if (!cachedGateway) {
		cachedGateway = new LLMGateway();
	}
	return cachedGateway;
}

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


/**
 * Generate a file summary
 */
export async function generateFileSummary(
	fileContent: string,
	filePath: string,
	model: string = 'openai/gpt-4o-mini',
	repoContext?: any
): Promise<FileSummary> {
	// Skip excluded files
	if (SKIP_FILE_PATTERNS.some(pattern => pattern.test(filePath))) {
		return {
			summary_text: `File ${filePath} is an auto-generated or lock file and was skipped from detailed analysis.`,
			resources: "",
		};
	}

	// Analyze the complete file content
	const contentToAnalyze = fileContent;

	let gateway: LLMGateway;
	try {
		gateway = getGateway();
	} catch (error: any) {
		console.error(`[fileSummarizer] ❌ LLM gateway initialization failed for ${filePath}: ${error.message}`);
		throw new Error(`AI service unavailable: ${error.message}`);
	}

	// Concise analysis prompt optimized for LLM context limits
	const systemPrompt = `You are an expert code analyst for any programming language. Analyze the provided code file and return structured JSON.

REQUIRED ANALYSIS:
1. summary: 2-4 sentence description of file purpose, functionality, and system role
2. purpose: Specific problem solved or business need addressed
3. mainExports: Array of all public/exported functions, classes, types, constants (language-appropriate)
4. allImports: Array of all dependencies/imports/includes (language-appropriate syntax)
5. technologies: Array of frameworks, libraries, technologies detected
6. resources: Comma-separated string of "type:name" pairs for external resources used in the file. Examples: "supabase_table:repo_file_summaries, api_endpoint:https://api.example.com/v1/users, database_table:users". Resources should be written exactly as they appear in the code. If no external resources are used, return an empty string "".

REQUIREMENTS:
- Analyze entire file content thoroughly
- Be language-agnostic (works with any programming language)
- Extract ALL imports and exports without omission
- Identify technologies across ecosystems (React, Django, Spring, .NET, etc.)
- Detect external resources: databases (PostgreSQL, MySQL, MongoDB), APIs (REST, GraphQL), services (AWS S3, Stripe, SendGrid), hosting (Vercel, Heroku, AWS), message queues (Redis, Kafka), etc.

Return only valid JSON matching this structure:
{
  "summary": "string",
  "purpose": "string",
  "mainExports": ["string"],
  "allImports": ["string"],
  "technologies": ["string"],
  "resources": "string"
}`;

	const userPrompt = `Analyze this code file and provide structured JSON summary:

**FILE:** ${filePath}

**CONTENT:**
\`\`\`
${contentToAnalyze}
\`\`\`

Follow the system prompt requirements exactly. Analyze the entire file content thoroughly and return only the JSON structure specified.`;

	try {
		const response = await gateway.call(
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt },
			],
			model,
			0.2 // Lower temperature for more consistent structured output
		);

		// Parse the JSON response
		try {
			// Try to extract JSON from markdown code blocks if present
			let jsonStr = response.trim();
			const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
			if (jsonMatch) {
				jsonStr = jsonMatch[1];
			}

			const parsed = JSON.parse(jsonStr) as any;

			// Return the summary content as summary_text (summary_text is just our DB field name)
			return {
				summary_text: parsed.summary || parsed.content || parsed.text || 'Unable to generate summary',
				resources: parsed.resources || ''
			};
		} catch (error) {
			console.error('Failed to parse file summary JSON:', error);
			// Return a fallback summary
			return {
				summary_text: `File: ${filePath}\n\nUnable to generate detailed summary due to parsing error.`,
				resources: "",
			};
		}
	} catch (error: any) {
		console.error(`[fileSummarizer] ❌ LLM gateway call failed for ${filePath}: ${error.message}`);
		throw new Error(`AI service unavailable: ${error.message}`);
	}
}
