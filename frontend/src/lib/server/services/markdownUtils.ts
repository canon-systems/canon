type ParsedSection = {
	title: string;
	level: number;
	content: string;
};

function parseMarkdown(markdown: string): ParsedSection[] {
	const sections: ParsedSection[] = [];
	const lines = markdown.split('\n');
	let currentSection: ParsedSection | null = null;
	let currentContent: string[] = [];

	for (const line of lines) {
		const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			if (currentSection) {
				sections.push({
					title: currentSection.title,
					level: currentSection.level,
					content: currentContent.join('\n').trim(),
				});
			}

			currentSection = {
				title: headingMatch[2].trim(),
				level: headingMatch[1].length,
				content: '',
			};
			currentContent = [];
		} else if (currentSection) {
			currentContent.push(line);
		} else if (sections.length === 0) {
			sections.push({
				title: 'Introduction',
				level: 1,
				content: line,
			});
		} else {
			sections[0].content += `\n${line}`;
		}
	}

	if (currentSection) {
		sections.push({
			title: currentSection.title,
			level: currentSection.level,
			content: currentContent.join('\n').trim(),
		});
	}

	return sections;
}

export function extractSection(markdown: string, sectionTitle: string): string | null {
	const sections = parseMarkdown(markdown);
	const target = sections.find((section) => section.title.toLowerCase() === sectionTitle.toLowerCase());
	if (!target) return null;
	return `# ${target.title}\n\n${target.content}`;
}

export function replaceSection(markdown: string, sectionTitle: string, newContent: string): string {
	const sections = parseMarkdown(markdown);
	let updated = false;

	for (const section of sections) {
		if (section.title.toLowerCase() === sectionTitle.toLowerCase()) {
			const cleaned = newContent.startsWith('#')
				? newContent
						.split('\n')
						.slice(1)
						.join('\n')
						.trim()
				: newContent.trim();
			section.content = cleaned;
			updated = true;
			break;
		}
	}

	if (!updated) {
		sections.push({
			title: sectionTitle,
			level: 2,
			content: newContent.trim(),
		});
	}

	return rebuildMarkdown(sections);
}

export function rebuildMarkdown(sections: ParsedSection[]): string {
	return sections
		.map((section) => {
			const heading = '#'.repeat(section.level);
			return `${heading} ${section.title}\n${section.content}`;
		})
		.join('\n\n')
		.trim();
}

