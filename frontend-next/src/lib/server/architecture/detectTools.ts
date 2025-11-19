/**
 * Tool Detection for Architecture Diagrams
 * Server-side tool detection logic adapted for web app use
 */

// Tool detection patterns
export const TOOL_PATTERNS: Record<
	string,
	{
		keywords: string[];
		envVars?: string[];
		apiPatterns?: RegExp[];
		configFiles?: string[];
		category: 'internal' | 'external';
		icon: string;
		description: string;
	}
> = {
	supabase: {
		keywords: ['supabase', '@supabase'],
		envVars: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY'],
		apiPatterns: [/supabase\.co/],
		category: 'internal',
		icon: '🗄️',
		description: 'Database & Authentication'
	},
	vercel: {
		keywords: ['vercel', '@vercel'],
		configFiles: ['vercel.json'],
		apiPatterns: [/vercel\.ai/, /vercel\.com/],
		envVars: ['VERCEL_AI_GATEWAY_URL', 'VERCEL_AI_GATEWAY_API_KEY'],
		category: 'internal',
		icon: '▲',
		description: 'Hosting & AI Gateway'
	},
	github: {
		keywords: ['github', '@octokit', 'octokit'],
		apiPatterns: [/github\.com/, /api\.github\.com/],
		envVars: ['GITHUB_TOKEN'],
		category: 'external',
		icon: '🐙',
		description: 'Version Control & API'
	},
	sveltekit: {
		keywords: ['@sveltejs/kit', 'sveltekit', 'svelte-kit'],
		category: 'internal',
		icon: '⚡',
		description: 'Frontend Framework'
	},
	vite: {
		keywords: ['vite', '@vitejs'],
		category: 'internal',
		icon: '⚡',
		description: 'Build Tool'
	},
	tailwindcss: {
		keywords: ['tailwindcss', '@tailwindcss'],
		category: 'internal',
		icon: '🎨',
		description: 'CSS Framework'
	},
	tiptap: {
		keywords: ['@tiptap', 'tiptap'],
		category: 'internal',
		icon: '📝',
		description: 'Rich Text Editor'
	},
	jszip: {
		keywords: ['jszip'],
		category: 'internal',
		icon: '📦',
		description: 'File Compression'
	},
	marked: {
		keywords: ['marked'],
		category: 'internal',
		icon: '📄',
		description: 'Markdown Parser'
	},
	turndown: {
		keywords: ['turndown'],
		category: 'internal',
		icon: '📄',
		description: 'HTML to Markdown'
	},
	react: {
		keywords: ['react', '@types/react'],
		category: 'internal',
		icon: '⚛️',
		description: 'UI Framework'
	},
	nextjs: {
		keywords: ['next', 'nextjs'],
		category: 'internal',
		icon: '▲',
		description: 'React Framework'
	},
	express: {
		keywords: ['express'],
		category: 'internal',
		icon: '🚂',
		description: 'Web Framework'
	},
	nodejs: {
		keywords: ['node'],
		category: 'internal',
		icon: '🟢',
		description: 'Runtime'
	},
	typescript: {
		keywords: ['typescript', '@types/'],
		category: 'internal',
		icon: '🔷',
		description: 'Programming Language'
	},
	python: {
		keywords: ['python', 'django', 'flask', 'fastapi'],
		category: 'internal',
		icon: '🐍',
		description: 'Programming Language'
	},
	aws: {
		keywords: ['aws-sdk', '@aws-sdk'],
		apiPatterns: [/\.amazonaws\.com/, /s3\./, /lambda\./, /ec2\./],
		envVars: ['AWS_ACCESS_KEY', 'AWS_SECRET_KEY', 'AWS_REGION'],
		category: 'external',
		icon: '☁️',
		description: 'Cloud Services'
	},
	azure: {
		keywords: ['@azure/'],
		apiPatterns: [/\.azure\.com/, /\.azurewebsites\.net/],
		category: 'external',
		icon: '☁️',
		description: 'Cloud Services'
	},
	gcp: {
		keywords: ['@google-cloud/'],
		apiPatterns: [/\.googleapis\.com/, /\.gcp\./],
		category: 'external',
		icon: '☁️',
		description: 'Cloud Services'
	},
	mongodb: {
		keywords: ['mongodb', 'mongoose'],
		apiPatterns: [/mongodb\.net/, /mongodb\.com/],
		category: 'external',
		icon: '🍃',
		description: 'Database'
	},
	postgresql: {
		keywords: ['pg', 'postgres', 'postgresql'],
		category: 'external',
		icon: '🐘',
		description: 'Database'
	},
	mysql: {
		keywords: ['mysql', 'mysql2'],
		category: 'external',
		icon: '🗄️',
		description: 'Database'
	},
	redis: {
		keywords: ['redis', 'ioredis'],
		category: 'external',
		icon: '🔴',
		description: 'Cache & Message Broker'
	},
	docker: {
		keywords: ['docker'],
		configFiles: ['Dockerfile', 'docker-compose.yml'],
		category: 'internal',
		icon: '🐳',
		description: 'Containerization'
	},
	kubernetes: {
		keywords: ['kubernetes', 'k8s'],
		configFiles: ['k8s', 'kubernetes'],
		category: 'internal',
		icon: '☸️',
		description: 'Orchestration'
	}
};

// Service connections
export const SERVICE_CONNECTIONS = [
	{ from: 'sveltekit', to: 'supabase', label: 'Database queries' },
	{ from: 'sveltekit', to: 'github', label: 'API calls' },
	{ from: 'sveltekit', to: 'vercel', label: 'AI Gateway' },
	{ from: 'vercel', to: 'github', label: 'Deployments' },
	{ from: 'supabase', to: 'github', label: 'Webhooks' },
	{ from: 'nextjs', to: 'vercel', label: 'Deployments' },
	{ from: 'react', to: 'nextjs', label: 'Framework' },
	{ from: 'express', to: 'nodejs', label: 'Runtime' }
];

export interface DetectedTool {
	name: string;
	category: 'internal' | 'external';
	icon: string;
	description: string;
	source: string;
	file?: string;
}

export interface DetectionResult {
	tools: DetectedTool[];
	connections: Array<{ from: string; to: string; label: string }>;
	detectedAt: string;
}

/**
 * Parse package.json content
 */
function parsePackageJson(content: string): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null {
	try {
		return JSON.parse(content);
	} catch {
		return null;
	}
}

/**
 * Search for patterns in file content
 */
function searchInContent(content: string, patterns: (string | RegExp)[]): boolean {
	return patterns.some((pattern) => {
		if (pattern instanceof RegExp) {
			return pattern.test(content);
		}
		return content.includes(pattern);
	});
}

/**
 * Detect tools from package.json
 */
function detectFromPackageJson(packageJsonContent: string, source: string): DetectedTool[] {
	const pkg = parsePackageJson(packageJsonContent);
	if (!pkg) return [];

	const detected: DetectedTool[] = [];
	const allDeps = {
		...(pkg.dependencies || {}),
		...(pkg.devDependencies || {}),
		...(pkg.peerDependencies || {})
	};

	Object.keys(TOOL_PATTERNS).forEach((toolName) => {
		const pattern = TOOL_PATTERNS[toolName];
		const found = pattern.keywords.some((keyword) =>
			Object.keys(allDeps).some((dep) => dep.includes(keyword))
		);

		if (found) {
			detected.push({
				name: toolName,
				...pattern,
				source
			});
		}
	});

	return detected;
}

/**
 * Detect tools from code files
 */
function detectFromCodeContent(content: string, fileName: string): DetectedTool[] {
	const detected: DetectedTool[] = [];

	Object.keys(TOOL_PATTERNS).forEach((toolName) => {
		const pattern = TOOL_PATTERNS[toolName];

		// Check API patterns
		if (pattern.apiPatterns && searchInContent(content, pattern.apiPatterns)) {
			detected.push({
				name: toolName,
				...pattern,
				source: 'code analysis',
				file: fileName
			});
		}

		// Check env vars
		if (pattern.envVars) {
			const envVarFound = pattern.envVars.some((envVar) =>
				searchInContent(content, [new RegExp(envVar, 'i')])
			);
			if (envVarFound) {
				detected.push({
					name: toolName,
					...pattern,
					source: 'code analysis',
					file: fileName
				});
			}
		}
	});

	return detected;
}

/**
 * Detect tools from file structure (config files)
 */
function detectFromFileStructure(fileName: string): DetectedTool[] {
	const detected: DetectedTool[] = [];

	Object.keys(TOOL_PATTERNS).forEach((toolName) => {
		const pattern = TOOL_PATTERNS[toolName];
		if (pattern.configFiles) {
			const found = pattern.configFiles.some((configFile) =>
				fileName.includes(configFile)
			);
			if (found) {
				detected.push({
					name: toolName,
					...pattern,
					source: 'config file',
					file: fileName
				});
			}
		}
	});

	return detected;
}

/**
 * Main detection function
 */
export function detectTools(files: Array<{ path: string; content: string }>): DetectionResult {
	const detectedTools = new Map<string, DetectedTool>();

	// Process each file
	files.forEach((file) => {
		const fileName = file.path.toLowerCase();

		// Check package.json files
		if (fileName.endsWith('package.json')) {
			const tools = detectFromPackageJson(file.content, 'package.json');
			tools.forEach((tool) => {
				detectedTools.set(tool.name, tool);
			});
		}

		// Check config files
		const configTools = detectFromFileStructure(fileName);
		configTools.forEach((tool) => {
			detectedTools.set(tool.name, tool);
		});

		// Check code files
		if (/\.(ts|js|tsx|jsx|svelte|py|java|go|rs)$/i.test(fileName)) {
			const codeTools = detectFromCodeContent(file.content, file.path);
			codeTools.forEach((tool) => {
				detectedTools.set(tool.name, tool);
			});
		}
	});

	// Convert to array
	const tools = Array.from(detectedTools.values());

	// Filter connections to only include detected tools
	const activeConnections = SERVICE_CONNECTIONS.filter(
		(conn) =>
			tools.some((t) => t.name === conn.from) && tools.some((t) => t.name === conn.to)
	);

	return {
		tools,
		connections: activeConnections,
		detectedAt: new Date().toISOString()
	};
}

