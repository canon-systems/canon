import { LLMGateway } from './llmGateway';

export type FileSummary = {
	summary_text: string;
	summary_json: {
		problem_solved?: string;
		functions: Array<{
			name: string;
			signature: string;
			description: string;
			exported: boolean;
			parameters: Array<{ name: string; type: string; description: string }>;
			returnType: string;
			logic?: string;
			calls?: string[];
			called_by?: string[];
			complexity?: 'simple' | 'medium' | 'complex';
			side_effects?: string[];
		}>;
		apis: Array<{
			type: 'http' | 'database' | 'service' | 'websocket' | 'graphql' | 'other';
			endpoint: string;
			method?: string;
			description: string;
			request_body?: string;
			response?: string;
			authentication?: string;
		}>;
		imports: Array<{
			module: string;
			type?: 'external' | 'internal' | 'relative';
			items: Array<{
				name: string;
				alias?: string;
				usage: string;
				usage_count?: number;
				usage_locations?: string[];
			}>;
			purpose: string;
		}>;
		logic: {
			main_flow: string;
			entry_points?: string[];
			algorithms: string[];
			data_structures?: string[];
			business_rules: string[];
			error_handling?: string;
			edge_cases?: string[];
			state_management?: string;
		};
		downstream_usage: Array<{
			file: string;
			functions: string[];
			context: string;
		}>;
		upstream_dependencies: Array<{
			file: string;
			functions: string[];
			purpose: string;
			usage_context?: string;
		}>;
		code_uses?: Array<{
			type: 'function' | 'class' | 'constant' | 'type' | 'interface';
			name: string;
			from: string;
			usage: string;
			location?: string;
		}>;
		design_patterns?: string[];
		key_decisions?: string[];
	};
};

export type RepoContext = {
	repoId: string;
	allFileSummaries: Map<string, FileSummary>; // file_path -> summary
};

// Maximum characters to process (roughly 100k tokens = ~400k chars, using conservative estimate)
const MAX_FILE_CHARS = 300000;

// Files that should be skipped entirely (lock files, auto-generated, etc.)
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
 * Generate a detailed file summary with structured information
 */
export async function generateFileSummary(
	fileContent: string,
	filePath: string,
	model: string = 'gpt-4o-mini',
	repoContext?: RepoContext
): Promise<FileSummary> {
	// Skip files that match exclusion patterns
	if (SKIP_FILE_PATTERNS.some(pattern => pattern.test(filePath))) {
		console.log(`[fileSummarizer] Skipping excluded file: ${filePath}`);
		return {
			summary_text: `File ${filePath} is an auto-generated or lock file and was skipped from detailed analysis.`,
			summary_json: {
				problem_solved: 'Auto-generated file (lock file or minified)',
				functions: [],
				apis: [],
				imports: [],
				logic: {
					main_flow: 'This file is auto-generated and not meant for manual editing.',
					algorithms: [],
					business_rules: [],
					entry_points: [],
					data_structures: [],
					error_handling: '',
					edge_cases: [],
					state_management: '',
				},
				downstream_usage: [],
				upstream_dependencies: [],
				code_uses: [],
				design_patterns: [],
				key_decisions: [],
			},
		};
	}

	// Check if file is too large
	if (fileContent.length > MAX_FILE_CHARS) {
		console.log(`[fileSummarizer] File too large (${fileContent.length} chars), truncating: ${filePath}`);
		// Truncate and add a note
		fileContent = fileContent.slice(0, MAX_FILE_CHARS) + '\n\n// ... [FILE TRUNCATED - TOO LARGE FOR FULL ANALYSIS] ...';
	}

	console.log(`[fileSummarizer] Generating summary for: ${filePath}`);
	
	let gateway: LLMGateway;
	try {
		gateway = new LLMGateway();
	} catch (error: any) {
		console.error(`[fileSummarizer] ❌ LLM gateway initialization failed for ${filePath}: ${error.message}`);
		throw new Error(`AI service unavailable: ${error.message}`);
	}

	// Build context about other files if available
	let contextSection = '';
	if (repoContext && repoContext.allFileSummaries.size > 0) {
		const relatedFiles: string[] = [];
		repoContext.allFileSummaries.forEach((summary, path) => {
			if (path !== filePath) {
				relatedFiles.push(`--- FILE: ${path} ---\n${summary.summary_text}`);
			}
		});
		if (relatedFiles.length > 0) {
			contextSection = `\n\n## Related Files in Repository\n\n${relatedFiles.slice(0, 10).join('\n\n')}\n\nUse this context to identify:\n- Where functions from this file are called (downstream_usage)\n- What this file depends on from other files (upstream_dependencies)`;
		}
	}

	const systemPrompt = `You are an expert code analyzer. Your task is to provide an extremely detailed and comprehensive analysis of the provided code file. Analyze every aspect of the code including imports, functions, logic flow, problem solving approach, and dependencies.

CRITICAL REQUIREMENTS:
1. List ALL imports (both external packages and internal modules) and explain exactly how each is used
2. Document ALL functions (exported and non-exported, including helpers, utilities, and internal functions)
3. Explain the problem this file solves and the approach taken
4. Detail the complete logic flow, including edge cases and error handling
5. Identify what other files/code this file uses (upstream dependencies)
6. Identify what files/code use this file (downstream usage) - use context if provided

Return a JSON object with this exact structure:
{
  "summary_text": "A comprehensive 4-6 paragraph summary that explains: (1) What problem this file solves, (2) The main approach/architecture used, (3) Key functions and their purposes, (4) Important logic patterns and algorithms, (5) Dependencies and relationships with other files, (6) Notable design decisions or patterns",
  "summary_json": {
    "problem_solved": "A detailed explanation of what problem or task this file addresses. What does it accomplish? What business need or technical requirement does it fulfill?",
    "functions": [
      {
        "name": "functionName",
        "signature": "complete function signature with all types and modifiers (async, export, etc.)",
        "description": "detailed description of what the function does, including its purpose and behavior",
        "exported": true/false,
        "parameters": [
          {"name": "param1", "type": "string", "description": "detailed description of what this parameter is for and how it's used"}
        ],
        "returnType": "string",
        "logic": "step-by-step explanation of the function's logic flow, including conditionals, loops, and key operations",
        "calls": ["otherFunction1", "externalAPI.method"], 
        "called_by": ["functionName2", "functionName3"],
        "complexity": "simple|medium|complex",
        "side_effects": ["modifies state", "makes API call", "none"]
      }
    ],
    "apis": [
      {
        "type": "http|database|service|websocket|graphql|other",
        "endpoint": "URL or identifier",
        "method": "GET|POST|PUT|DELETE|PATCH|etc (for HTTP)",
        "description": "detailed description of what this API does, what data it handles, and when it's called",
        "request_body": "description of request payload structure if applicable",
        "response": "description of response structure if applicable",
        "authentication": "how authentication is handled if applicable"
      }
    ],
    "imports": [
      {
        "module": "module/path",
        "type": "external|internal|relative",
        "items": [
          {
            "name": "ItemName", 
            "alias": "Alias (if any)", 
            "usage": "detailed explanation of how and where this item is used in the file, including specific line contexts or function names",
            "usage_count": 3,
            "usage_locations": ["functionName1", "functionName2", "line 45"]
          }
        ],
        "purpose": "detailed explanation of why this import is needed and what functionality it provides to this file"
      }
    ],
    "logic": {
      "main_flow": "comprehensive step-by-step description of the main execution flow from entry point to completion, including all branches and conditions",
      "entry_points": ["exported function names or API routes that serve as entry points"],
      "algorithms": ["detailed description of each algorithm used, including time/space complexity if applicable"],
      "data_structures": ["arrays, objects, maps, sets, etc. used and their purposes"],
      "business_rules": ["all business logic rules, validation rules, and constraints enforced"],
      "error_handling": "description of how errors are handled, what types of errors can occur, and recovery strategies",
      "edge_cases": ["edge cases and special conditions handled in the code"],
      "state_management": "description of any state management, caching, or data persistence used"
    },
    "downstream_usage": [
      {
        "file": "path/to/file.ts",
        "functions": ["functionName1", "functionName2"],
        "context": "detailed explanation of how and why this file uses functions from the analyzed file, including the specific use case"
      }
    ],
    "upstream_dependencies": [
      {
        "file": "path/to/file.ts",
        "functions": ["functionName1"],
        "purpose": "detailed explanation of why this file depends on that function, what it needs from it, and how it's used",
        "usage_context": "specific context of where and how the dependency is used in this file"
      }
    ],
    "code_uses": [
      {
        "type": "function|class|constant|type|interface",
        "name": "itemName",
        "from": "module/path or file path",
        "usage": "how this code item is used in the file",
        "location": "where in the file it's used (function name or line context)"
      }
    ],
    "design_patterns": ["list of design patterns used (e.g., singleton, factory, observer, etc.)"],
    "key_decisions": ["important architectural or design decisions made in this file and why"]
  }
}

IMPORTANT:
- Be extremely thorough - analyze every import, every function, every logic branch
- For imports: explain not just what is imported, but exactly how and where each item is used
- For functions: include ALL functions, not just exported ones. Document internal helpers, utilities, and callbacks
- For logic: provide step-by-step flow, not just high-level description
- For dependencies: be specific about what code is used and what uses this code
- Use the context provided to identify downstream_usage relationships
- If context is not provided, still analyze upstream_dependencies from imports

Be comprehensive and detailed. This summary will be used for documentation generation and code understanding.`;

	const userPrompt = `Analyze this file in extreme detail:

--- FILE: ${filePath} ---
${fileContent}
${contextSection}

REQUIREMENTS:
1. Identify and document EVERY import - what it is, where it's used, and how it's used
2. Document EVERY function (exported and internal) - what it does, its logic flow, what it calls, and what calls it
3. Explain the problem this file solves and the approach taken
4. Detail the complete logic flow including all branches, conditionals, and edge cases
5. Identify ALL dependencies - what code this file uses (from imports and context)
6. Identify what code uses this file (from context if provided)
7. Document any design patterns, algorithms, or notable architectural decisions

Return the comprehensive JSON object as specified in the system prompt. Be thorough and detailed.`;

	const response = await gateway.call(
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		],
		model,
		0.2, // Lower temperature for more consistent structured output
		filePath // Pass file path as context for logging
	);

	// Parse the JSON response
	try {
		// Try to extract JSON from markdown code blocks if present
		let jsonStr = response.trim();
		const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
		if (jsonMatch) {
			jsonStr = jsonMatch[1];
		}

		const parsed = JSON.parse(jsonStr) as FileSummary;

		// Validate structure
		if (!parsed.summary_text || !parsed.summary_json) {
			throw new Error('Invalid summary structure: missing summary_text or summary_json');
		}

		// Ensure all required fields exist
		if (!parsed.summary_json.problem_solved) parsed.summary_json.problem_solved = '';
		if (!parsed.summary_json.functions) parsed.summary_json.functions = [];
		if (!parsed.summary_json.apis) parsed.summary_json.apis = [];
		if (!parsed.summary_json.imports) parsed.summary_json.imports = [];
		if (!parsed.summary_json.logic) {
			parsed.summary_json.logic = {
				main_flow: '',
				algorithms: [],
				business_rules: [],
				entry_points: [],
				data_structures: [],
				error_handling: '',
				edge_cases: [],
				state_management: '',
			};
		}
		if (!parsed.summary_json.downstream_usage) parsed.summary_json.downstream_usage = [];
		if (!parsed.summary_json.upstream_dependencies) parsed.summary_json.upstream_dependencies = [];
		if (!parsed.summary_json.code_uses) parsed.summary_json.code_uses = [];
		if (!parsed.summary_json.design_patterns) parsed.summary_json.design_patterns = [];
		if (!parsed.summary_json.key_decisions) parsed.summary_json.key_decisions = [];

		return parsed;
	} catch (error) {
		console.error('Failed to parse file summary JSON:', error);
		console.error('Raw response:', response);
		// Return a fallback summary
		return {
			summary_text: `File: ${filePath}\n\n${fileContent.slice(0, 500)}...`,
			summary_json: {
				problem_solved: 'Unable to parse summary',
				functions: [],
				apis: [],
				imports: [],
				logic: {
					main_flow: 'Unable to parse summary',
					algorithms: [],
					business_rules: [],
					entry_points: [],
					data_structures: [],
					error_handling: '',
					edge_cases: [],
					state_management: '',
				},
				downstream_usage: [],
				upstream_dependencies: [],
				code_uses: [],
				design_patterns: [],
				key_decisions: [],
			},
		};
	}
}

