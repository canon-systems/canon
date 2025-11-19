/**
 * Generate Mermaid diagram from detection results
 */

import type { DetectionResult } from './detectTools';

/**
 * Generate Mermaid diagram syntax
 */
export function generateMermaidDiagram(detectionResult: DetectionResult): string {
	const { tools, connections } = detectionResult;

	// Separate tools by category
	const internalTools = tools.filter((t) => t.category === 'internal');
	const externalTools = tools.filter((t) => t.category === 'external');

	let mermaid = '```mermaid\n';
	mermaid += 'graph TB\n';
	mermaid += '    %% Styling - Matches app dark theme\n';
	// Internal services: Blue with dark theme styling (matches app's blue accents)
	// Using darker blue (#1e3a8a) with lighter border (#3b82f6) for better contrast
	mermaid += '    classDef internal fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#fff\n';
	// External services: Gray with dark theme styling (matches app's gray palette)
	// Using darker gray (#374151) with lighter border (#6b7280)
	mermaid += '    classDef external fill:#374151,stroke:#6b7280,stroke-width:2px,color:#fff\n';
	// Frontend: Purple with dark theme styling (matches app's accent colors)
	// Using darker purple (#5b21b6) with lighter border (#8b5cf6)
	mermaid += '    classDef frontend fill:#5b21b6,stroke:#8b5cf6,stroke-width:2px,color:#fff\n';
	// Connection styling - subtle white with opacity
	mermaid += '    linkStyle default stroke:#ffffff40,stroke-width:2px\n';
	mermaid += '\n';

	// Add internal services
	mermaid += '    %% Internal Services\n';
	internalTools.forEach((tool) => {
		const label = `${tool.icon || '📦'} ${tool.name}`;
		const nodeId = tool.name.replace(/[^a-zA-Z0-9]/g, '_');
		mermaid += `    ${nodeId}["${label}"]\n`;

		// Special styling for frontend
		if (tool.name === 'sveltekit' || tool.name === 'react' || tool.name === 'nextjs') {
			mermaid += `    class ${nodeId} frontend\n`;
		} else {
			mermaid += `    class ${nodeId} internal\n`;
		}
	});

	mermaid += '\n';

	// Add external services
	mermaid += '    %% External Services\n';
	externalTools.forEach((tool) => {
		const label = `${tool.icon || '🌐'} ${tool.name}`;
		const nodeId = tool.name.replace(/[^a-zA-Z0-9]/g, '_');
		mermaid += `    ${nodeId}["${label}"]\n`;
		mermaid += `    class ${nodeId} external\n`;
	});

	mermaid += '\n';

	// Add connections
	mermaid += '    %% Connections\n';
	connections.forEach((conn) => {
		const fromId = conn.from.replace(/[^a-zA-Z0-9]/g, '_');
		const toId = conn.to.replace(/[^a-zA-Z0-9]/g, '_');
		const label = conn.label || '';
		mermaid += `    ${fromId} -->|"${label}"| ${toId}\n`;
	});

	mermaid += '```\n';

	return mermaid;
}

/**
 * Generate markdown documentation with diagram
 */
export function generateMarkdownDoc(detectionResult: DetectionResult): string {
	const { tools, connections, detectedAt } = detectionResult;

	const internalTools = tools.filter((t) => t.category === 'internal');
	const externalTools = tools.filter((t) => t.category === 'external');

	let markdown = '# Architecture Diagram\n\n';
	markdown += `*Auto-generated on ${new Date(detectedAt).toLocaleString()}*\n\n`;

	markdown += '## Overview\n\n';
	markdown +=
		'This diagram shows all tools and services used in this codebase, automatically detected from configuration files and code analysis.\n\n';

	markdown += '## Diagram\n\n';
	markdown += generateMermaidDiagram(detectionResult);
	markdown += '\n';

	markdown += '## Legend\n\n';
	markdown += '- 🟣 **Frontend** - User-facing application layer\n';
	markdown += '- 🔵 **Internal Services** - Services we control and deploy\n';
	markdown += '- ⚫ **External Services** - Third-party services and APIs\n\n';

	markdown += '## Detected Tools\n\n';

	if (internalTools.length > 0) {
		markdown += '### Internal Services\n\n';
		internalTools.forEach((tool) => {
			markdown += `- **${tool.icon || '📦'} ${tool.name}** - ${tool.description || 'No description'}\n`;
		});
		markdown += '\n';
	}

	if (externalTools.length > 0) {
		markdown += '### External Services\n\n';
		externalTools.forEach((tool) => {
			markdown += `- **${tool.icon || '🌐'} ${tool.name}** - ${tool.description || 'No description'}\n`;
		});
		markdown += '\n';
	}

	markdown += '## Service Connections\n\n';
	if (connections.length > 0) {
		connections.forEach((conn) => {
			markdown += `- **${conn.from}** → **${conn.to}**: ${conn.label}\n`;
		});
	} else {
		markdown += 'No explicit connections detected.\n';
	}

	markdown += '\n---\n\n';
	markdown += '*This diagram is automatically generated.*\n';

	return markdown;
}

