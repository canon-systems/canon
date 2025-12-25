import type { SupabaseClient } from '@supabase/supabase-js';
import Parser from 'web-tree-sitter';
import fs from 'fs';
import path from 'path';
import { createServiceRoleClient } from '../../supabase/server';
export interface DependencyInfo {
    filePath: string;
    language: string;
    imports: string[];
    exports: string[];
    dependencies: string[];
}

export interface ComponentCluster {
    files: string[];
    dependencies: string[];
    metadata?: any;
}

export interface ArchitectureComponent {
    id: string;
    name: string;
    type: 'entry' | 'api' | 'business' | 'data' | 'ui' | 'infra' | 'auth' | 'config' | 'middleware' | 'util' | 'test';
    files: string[];
    dependencies: string[];
}

const COMPONENT_TYPE_LABELS: Record<ArchitectureComponent['type'], string> = {
    entry: 'Entry Points',
    api: 'API Layer',
    business: 'Business Logic',
    data: 'Data Layer',
    ui: 'User Interface',
    infra: 'Infrastructure',
    auth: 'Authentication',
    config: 'Configuration',
    middleware: 'Middleware',
    util: 'Utilities',
    test: 'Tests'
};

const EXTERNAL_CATEGORY_LABELS: Record<ExternalCategory | 'other', string> = {
    api: 'APIs & SDKs',
    ai: 'AI & ML',
    auth: 'Authentication',
    cloud: 'Cloud Platform',
    db: 'Datastores',
    queue: 'Queues & Streaming',
    search: 'Search & Vector',
    observability: 'Monitoring',
    orchestration: 'Orchestration',
    storage: 'Storage',
    messaging: 'Messaging',
    email: 'Email',
    payments: 'Payments',
    cdn: 'CDN & Edge',
    other: 'Other Tools'
};


export type ExternalCategory =
    | 'api'
    | 'ai'
    | 'auth'
    | 'cloud'
    | 'db'
    | 'queue'
    | 'search'
    | 'observability'
    | 'orchestration'
    | 'storage'
    | 'messaging'
    | 'email'
    | 'payments'
    | 'cdn'
    | 'other';

export interface ExternalTarget {
    id: string;
    label: string;
    category: ExternalCategory;
    packageNames?: string[];
    packagePrefixes?: string[];
    protocolSchemes?: string[];
    serviceHostPatterns?: string[];
    surfaces?: any[];
    provider?: string | null;
    needsReview?: boolean;
    enabled?: boolean;
}

export interface ExternalRelationship {
    from: string;
    to: string;
    strength: number;
}

export interface HighLevelNode {
    id: string;
    label: string;
    type: 'internal' | 'external';
    category?: string;
    componentIds?: string[];
    vendorIds?: string[];
    fileCount?: number;
    vendorLabels?: string[];
    needsReview?: boolean;
    files?: string[];
    packages?: string[];
    role?: string;
    source?: 'code' | 'manifest' | 'mixed';
    manifestOnly?: boolean;
}

export interface HighLevelEdge {
    from: string;
    to: string;
    strength: number;
    kind: 'internal' | 'external';
}

export interface ArchitectureAnalysis {
    components: ArchitectureComponent[];
    relationships: Array<{ from: string, to: string, type: string, strength: number }>;
    externalTargets?: ExternalTarget[];
    externalRelationships?: ExternalRelationship[];
    highLevelNodes?: HighLevelNode[];
    highLevelEdges?: HighLevelEdge[];
    groupMappings?: {
        componentToGroup: Record<string, string>;
        vendorToGroup: Record<string, string>;
    };
    fullNodes?: HighLevelNode[];
    fullEdges?: HighLevelEdge[];
    mermaid: string;
}

const rowEnabled = (row: any): boolean => {
    // Treat null/undefined as enabled to avoid filtering out rows missing the flag
    if (row === null || row === undefined) return false;
    if ('enabled' in row) return row.enabled !== false;
    return true;
};

export class TreeSitterAnalyzer {
    private parsers: Map<string, Parser> = new Map();
    private languages: Map<string, Parser.Language> = new Map();
    private initialized = false;
    private supportedLanguages: Set<string> = new Set();

    async initialize(): Promise<void> {
        if (this.initialized) return;

        await Parser.init({
            locateFile: (filename: string) => path.join(process.cwd(), 'public', 'tree-sitter', filename)
        });

        // Load Tree-sitter languages from local WASM files
        const languageConfigs = [
            { name: 'javascript', wasmPath: '/tree-sitter/tree-sitter-javascript.wasm' },
            { name: 'typescript', wasmPath: '/tree-sitter/tree-sitter-typescript.wasm' },
            { name: 'tsx', wasmPath: '/tree-sitter/tree-sitter-typescript.wasm' }, // TSX uses TypeScript parser
            { name: 'python', wasmPath: '/tree-sitter/tree-sitter-python.wasm' },
            { name: 'java', wasmPath: '/tree-sitter/tree-sitter-java.wasm' },
            { name: 'go', wasmPath: '/tree-sitter/tree-sitter-go.wasm' },
            { name: 'rust', wasmPath: '/tree-sitter/tree-sitter-rust.wasm' },
            { name: 'cpp', wasmPath: '/tree-sitter/tree-sitter-cpp.wasm' },
            { name: 'c', wasmPath: '/tree-sitter/tree-sitter-c.wasm' },
            { name: 'csharp', wasmPath: '/tree-sitter/tree-sitter-c-sharp.wasm' }, // Note: WASM file uses c-sharp but config uses csharp
            { name: 'php', wasmPath: '/tree-sitter/tree-sitter-php.wasm' },
            { name: 'ruby', wasmPath: '/tree-sitter/tree-sitter-ruby.wasm' },
        ];

        // Load Tree-sitter parsers - only support languages that successfully load
        for (const config of languageConfigs) {
            try {
                // Check if WASM file exists locally
                const wasmPath = path.join(process.cwd(), 'public', config.wasmPath);

                if (fs.existsSync(wasmPath) && fs.statSync(wasmPath).size > 0) {
                    try {
                        // Load the language from local WASM file
                        const language = await Parser.Language.load(wasmPath);
                        this.languages.set(config.name, language);

                        // Create and configure parser
                        const parser = new Parser();
                        parser.setLanguage(language);
                        this.parsers.set(config.name, parser);

                        // Only mark as supported if Tree-sitter parser successfully loads
                        this.supportedLanguages.add(config.name);
                        console.log(`✅ Loaded ${config.name} Tree-sitter parser`);
                    } catch (error) {
                        console.warn(`❌ Failed to load ${config.name} parser:`, error instanceof Error ? error.message : String(error));
                        console.log(`⚠️ Skipping ${config.name} - no Tree-sitter support available`);
                    }
                } else {
                    console.log(`⚠️ WASM file not found for ${config.name}, skipping`);
                }
            } catch (error) {
                console.warn(`❌ Error loading ${config.name} language:`, error);
            }
        }

        console.log(`🎯 Tree-sitter analyzer ready with ${this.parsers.size} working parsers`);
        if (this.parsers.size === 0) {
            console.warn(`⚠️ No Tree-sitter parsers loaded. Run 'node setup-tree-sitter.js' to download compatible WASM files.`);
        }

        this.initialized = true;
    }

    async analyzeRepository(
        supabase: SupabaseClient,
        repoId: string,
        files: Array<{ path: string, content: string }>,
        manifestFiles: Array<{ path: string, content: string }> = []
    ): Promise<ArchitectureAnalysis> {
        await this.initialize();

        const dependencies = await this.extractDependencies(files);
        const components = this.clusterIntoComponents(dependencies);
        const registryTargets = await this.loadExternalRegistry(supabase);
        const combinedExternalTargets = registryTargets;
        const relationships = this.buildRelationships(components, dependencies);
        const externalRelationships = this.buildExternalRelationships(components, dependencies, combinedExternalTargets, []);

        // Tool-centric graph (focus on services/tools rather than component buckets)
        const toolGraph = this.buildToolGraph(dependencies, combinedExternalTargets);
        const mermaid = this.generateMermaidDiagram(toolGraph.nodes, toolGraph.edges);

        return {
            components,
            relationships,
            externalTargets: combinedExternalTargets,
            externalRelationships,
            highLevelNodes: toolGraph.nodes,
            highLevelEdges: toolGraph.edges,
            fullNodes: toolGraph.fullNodes,
            fullEdges: toolGraph.fullEdges,
            groupMappings: toolGraph.groupMappings,
            mermaid
        };
    }

    private async extractDependencies(files: Array<{ path: string, content: string }>): Promise<DependencyInfo[]> {
        const results: DependencyInfo[] = [];

        for (const file of files) {
            const language = this.detectLanguage(file.path);
            if (!language || !this.parsers.has(language)) {
                console.log(`⚠️ Skipping ${file.path} - no Tree-sitter parser available for ${language || 'unknown language'}`);
                continue; // Skip files without Tree-sitter parsers
            }

            try {
                const parser = this.parsers.get(language)!;

                // Parse with Tree-sitter
                const tree = parser.parse(file.content);
                const imports = this.extractImports(tree, language);
                const exports = this.extractExports(tree, language);

                results.push({
                    filePath: file.path,
                    language,
                    imports,
                    exports,
                    dependencies: imports
                });

                console.log(`✅ Parsed ${file.path} with Tree-sitter (${language})`);
            } catch (error) {
                console.warn(`Tree-sitter parsing failed for ${file.path}:`, error);
                // Tree-sitter only - no fallback
            }
        }

        return results;
    }

    private detectLanguage(filePath: string): string | null {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const extMap: Record<string, string> = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'python',
            'java': 'java',
            'go': 'go',
            'rs': 'rust',
            'cpp': 'cpp',
            'cc': 'cpp',
            'cxx': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'php': 'php',
            'rb': 'ruby'
        };

        return extMap[ext || ''] || null;
    }

    private extractImports(tree: Parser.Tree, language: string): string[] {
        switch (language) {
            case 'javascript':
            case 'typescript':
                return this.extractJSImports(tree);
            case 'python':
                return this.extractPythonImports(tree);
            case 'java':
                return this.extractJavaImports(tree);
            case 'go':
                return this.extractGoImports(tree);
            case 'rust':
                return this.extractRustImports(tree);
            case 'csharp':
                return this.extractCSharpImports(tree);
            case 'php':
                return this.extractPHPImports(tree);
            case 'ruby':
                return this.extractRubyImports(tree);
            default:
                return [];
        }
    }

    private extractExports(tree: Parser.Tree, language: string): string[] {
        switch (language) {
            case 'javascript':
            case 'typescript':
                return this.extractJSExports(tree);
            case 'python':
                return this.extractPythonExports(tree);
            case 'java':
                return this.extractJavaExports(tree);
            case 'go':
                return this.extractGoExports(tree);
            case 'rust':
                return this.extractRustExports(tree);
            case 'csharp':
                return this.extractCSharpExports(tree);
            case 'php':
                return this.extractPHPExports(tree);
            case 'ruby':
                return this.extractRubyExports(tree);
            default:
                return [];
        }
    }

    // JavaScript/TypeScript import/export extraction (Tree-sitter AST-based)
    private extractJSImports(tree: Parser.Tree): string[] {
        const imports: string[] = [];

        // Find all import statements
        const importStatements = tree.rootNode.descendantsOfType('import_statement');
        for (const stmt of importStatements) {
            try {
                const sourceNode = stmt.childForFieldName('source');
                if (sourceNode) {
                    const importPath = sourceNode.text.replace(/['"]/g, '');
                    imports.push(importPath);
                }
            } catch (error) {
                console.warn('Error parsing import statement:', error);
            }
        }

        // Find CommonJS require calls
        const callExpressions = tree.rootNode.descendantsOfType('call_expression');
        for (const call of callExpressions) {
            try {
                const functionNode = call.childForFieldName('function');
                if (functionNode?.text === 'require') {
                    const args = call.childForFieldName('arguments');
                    if (args) {
                        // Handle both string literals and template literals
                        const stringLiterals = args.descendantsOfType('string');
                        const templateStrings = args.descendantsOfType('template_string');

                        [...stringLiterals, ...templateStrings].forEach(node => {
                            const requirePath = node.text.replace(/['`]/g, '');
                            imports.push(requirePath);
                        });
                    }
                }
            } catch (error) {
                console.warn('Error parsing require call:', error);
            }
        }

        return [...new Set(imports)]; // Remove duplicates
    }

    private extractJSExports(tree: Parser.Tree): string[] {
        const exports: string[] = [];

        // Find all export statements
        const exportStatements = tree.rootNode.descendantsOfType('export_statement');
        for (const stmt of exportStatements) {
            try {
                // Named exports with declaration
                const declaration = stmt.childForFieldName('declaration');
                if (declaration) {
                    if (declaration.type === 'function_declaration' || declaration.type === 'class_declaration') {
                        const nameNode = declaration.childForFieldName('name');
                        if (nameNode) {
                            exports.push(nameNode.text);
                        }
                    } else if (declaration.type === 'variable_declaration') {
                        const declarators = declaration.descendantsOfType('variable_declarator');
                        for (const declarator of declarators) {
                            const nameNode = declarator.childForFieldName('name');
                            if (nameNode) {
                                exports.push(nameNode.text);
                            }
                        }
                    }
                }

                // Export list: export { foo, bar }
                const exportClause = stmt.childForFieldName('export_clause');
                if (exportClause) {
                    const identifiers = exportClause.descendantsOfType('identifier');
                    for (const identifier of identifiers) {
                        exports.push(identifier.text);
                    }
                }

                // Default export
                if (stmt.childForFieldName('default')) {
                    // For default exports, we might not have a name, so we'll use a placeholder
                    exports.push('default');
                }
            } catch (error) {
                console.warn('Error parsing export statement:', error);
            }
        }

        return [...new Set(exports)]; // Remove duplicates
    }

    // Python import/export extraction (Tree-sitter AST-based)
    private extractPythonImports(tree: Parser.Tree): string[] {
        const imports: string[] = [];

        try {
            // Find import statements: import module
            const importStatements = tree.rootNode.descendantsOfType('import_statement');
            for (const stmt of importStatements) {
                const nameNodes = stmt.descendantsOfType('dotted_name');
                for (const nameNode of nameNodes) {
                    imports.push(nameNode.text);
                }
            }

            // Find from...import statements: from module import ...
            const fromImportStatements = tree.rootNode.descendantsOfType('import_from_statement');
            for (const stmt of fromImportStatements) {
                const moduleNode = stmt.childForFieldName('module');
                if (moduleNode) {
                    imports.push(moduleNode.text);
                }
            }
        } catch (error) {
            console.warn('Error parsing Python imports:', error);
        }

        return [...new Set(imports)]; // Remove duplicates
    }

    private extractPythonExports(tree: Parser.Tree): string[] {
        const exports: string[] = [];

        try {
            // Find function definitions (public functions)
            const functionDefs = tree.rootNode.descendantsOfType('function_definition');
            for (const func of functionDefs) {
                const nameNode = func.childForFieldName('name');
                if (nameNode) {
                    const funcName = nameNode.text;
                    // In Python, functions starting with underscore are private
                    if (!funcName.startsWith('_')) {
                        exports.push(funcName);
                    }
                }
            }

            // Find class definitions
            const classDefs = tree.rootNode.descendantsOfType('class_definition');
            for (const cls of classDefs) {
                const nameNode = cls.childForFieldName('name');
                if (nameNode) {
                    const className = nameNode.text;
                    // Classes starting with underscore are private
                    if (!className.startsWith('_')) {
                        exports.push(className);
                    }
                }
            }

            // Find variable assignments at module level (potential exports)
            const assignmentStatements = tree.rootNode.descendantsOfType('assignment');
            for (const assignment of assignmentStatements) {
                const leftNode = assignment.childForFieldName('left');
                if (leftNode && leftNode.type === 'identifier') {
                    const varName = leftNode.text;
                    // Variables starting with underscore are private
                    if (!varName.startsWith('_') && !varName.startsWith('__')) {
                        exports.push(varName);
                    }
                }
            }
        } catch (error) {
            console.warn('Error parsing Python exports:', error);
        }

        return [...new Set(exports)]; // Remove duplicates
    }

    // Java import/export extraction (Tree-sitter AST-based)
    private extractJavaImports(tree: Parser.Tree): string[] {
        const imports: string[] = [];

        try {
            // Find import declarations
            const importDeclarations = tree.rootNode.descendantsOfType('import_declaration');
            for (const decl of importDeclarations) {
                const scopedIdentifier = decl.descendantsOfType('scoped_identifier');
                for (const identifier of scopedIdentifier) {
                    imports.push(identifier.text);
                }
            }
        } catch (error) {
            console.warn('Error parsing Java imports:', error);
        }

        return [...new Set(imports)]; // Remove duplicates
    }

    private extractJavaExports(tree: Parser.Tree): string[] {
        const exports: string[] = [];

        try {
            // Find class declarations (public classes)
            const classDeclarations = tree.rootNode.descendantsOfType('class_declaration');
            for (const decl of classDeclarations) {
                const modifiers = decl.childForFieldName('modifiers');
                const nameNode = decl.childForFieldName('name');

                if (nameNode) {
                    // Check if public (or no modifier, which defaults to package-private, but we'll include for analysis)
                    const publicModifiers = modifiers?.descendantsOfType('public');
                    const isPublic = publicModifiers && publicModifiers.length > 0;
                    if (isPublic || !modifiers) {
                        exports.push(nameNode.text);
                    }
                }
            }

            // Find interface declarations
            const interfaceDeclarations = tree.rootNode.descendantsOfType('interface_declaration');
            for (const decl of interfaceDeclarations) {
                const modifiers = decl.childForFieldName('modifiers');
                const nameNode = decl.childForFieldName('name');

                if (nameNode) {
                    const publicModifiers = modifiers?.descendantsOfType('public');
                    const isPublic = publicModifiers && publicModifiers.length > 0;
                    if (isPublic || !modifiers) {
                        exports.push(nameNode.text);
                    }
                }
            }

            // Find enum declarations
            const enumDeclarations = tree.rootNode.descendantsOfType('enum_declaration');
            for (const decl of enumDeclarations) {
                const modifiers = decl.childForFieldName('modifiers');
                const nameNode = decl.childForFieldName('name');

                if (nameNode) {
                    const publicModifiers = modifiers?.descendantsOfType('public');
                    const isPublic = publicModifiers && publicModifiers.length > 0;
                    if (isPublic || !modifiers) {
                        exports.push(nameNode.text);
                    }
                }
            }

            // Find method declarations in classes (public methods)
            const methodDeclarations = tree.rootNode.descendantsOfType('method_declaration');
            for (const decl of methodDeclarations) {
                const modifiers = decl.childForFieldName('modifiers');
                const nameNode = decl.childForFieldName('name');

                if (nameNode) {
                    const publicModifiers = modifiers?.descendantsOfType('public');
                    const isPublic = publicModifiers && publicModifiers.length > 0;
                    if (isPublic) {
                        exports.push(nameNode.text);
                    }
                }
            }
        } catch (error) {
            console.warn('Error parsing Java exports:', error);
        }

        return [...new Set(exports)]; // Remove duplicates
    }

    // Go import/export extraction (Tree-sitter AST-based)
    private extractGoImports(tree: Parser.Tree): string[] {
        const imports: string[] = [];

        try {
            // Find import declarations
            const importDeclarations = tree.rootNode.descendantsOfType('import_declaration');
            for (const decl of importDeclarations) {
                // Handle import blocks
                const importSpecList = decl.descendantsOfType('import_spec_list');
                for (const specList of importSpecList) {
                    const importSpecs = specList.descendantsOfType('import_spec');
                    for (const spec of importSpecs) {
                        const pathNode = spec.childForFieldName('path');
                        if (pathNode) {
                            imports.push(pathNode.text.replace(/"/g, ''));
                        }
                    }
                }

                // Handle single imports
                const importSpecs = decl.descendantsOfType('import_spec');
                for (const spec of importSpecs) {
                    const pathNode = spec.childForFieldName('path');
                    if (pathNode) {
                        imports.push(pathNode.text.replace(/"/g, ''));
                    }
                }
            }
        } catch (error) {
            console.warn('Error parsing Go imports:', error);
        }

        return [...new Set(imports)]; // Remove duplicates
    }

    private extractGoExports(tree: Parser.Tree): string[] {
        const exports: string[] = [];

        try {
            // Find function declarations (Go exports by capitalization)
            const functionDeclarations = tree.rootNode.descendantsOfType('function_declaration');
            for (const decl of functionDeclarations) {
                const nameNode = decl.childForFieldName('name');
                if (nameNode && nameNode.text[0] === nameNode.text[0].toUpperCase()) {
                    // In Go, exported identifiers start with capital letters
                    exports.push(nameNode.text);
                }
            }

            // Find type declarations
            const typeDeclarations = tree.rootNode.descendantsOfType('type_declaration');
            for (const decl of typeDeclarations) {
                const typeSpec = decl.childForFieldName('type_spec');
                if (typeSpec) {
                    const nameNode = typeSpec.childForFieldName('name');
                    if (nameNode && nameNode.text[0] === nameNode.text[0].toUpperCase()) {
                        exports.push(nameNode.text);
                    }
                }
            }

            // Find method declarations
            const methodDeclarations = tree.rootNode.descendantsOfType('method_declaration');
            for (const decl of methodDeclarations) {
                const nameNode = decl.childForFieldName('name');
                if (nameNode && nameNode.text[0] === nameNode.text[0].toUpperCase()) {
                    exports.push(nameNode.text);
                }
            }

            // Find const/var declarations
            const constDeclarations = tree.rootNode.descendantsOfType('const_declaration');
            const varDeclarations = tree.rootNode.descendantsOfType('var_declaration');
            const declarations = [...constDeclarations, ...varDeclarations];

            for (const decl of declarations) {
                const specList = decl.descendantsOfType('const_spec_list') ||
                    decl.descendantsOfType('var_spec_list');
                for (const spec of specList) {
                    const specs = spec.descendantsOfType('const_spec') ||
                        spec.descendantsOfType('var_spec');
                    for (const s of specs) {
                        const nameNode = s.childForFieldName('name');
                        if (nameNode && nameNode.text[0] === nameNode.text[0].toUpperCase()) {
                            exports.push(nameNode.text);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('Error parsing Go exports:', error);
        }

        return [...new Set(exports)]; // Remove duplicates
    }

    // Rust import/export extraction (Tree-sitter AST-based)
    private extractRustImports(tree: Parser.Tree): string[] {
        const imports: string[] = [];

        // Find use declarations
        const useDeclarations = tree.rootNode.descendantsOfType('use_declaration');
        for (const decl of useDeclarations) {
            const pathNode = decl.childForFieldName('argument');
            if (pathNode) {
                imports.push(pathNode.text);
            }
        }

        return [...new Set(imports)]; // Remove duplicates
    }

    private extractRustExports(tree: Parser.Tree): string[] {
        const exports: string[] = [];

        // Find public function items
        const functionItems = tree.rootNode.descendantsOfType('function_item');
        for (const func of functionItems) {
            const visibility = func.childForFieldName('visibility');
            if (visibility?.text === 'pub') {
                const nameNode = func.childForFieldName('name');
                if (nameNode) {
                    exports.push(nameNode.text);
                }
            }
        }

        // Find public struct items
        const structItems = tree.rootNode.descendantsOfType('struct_item');
        for (const struct of structItems) {
            const visibility = struct.childForFieldName('visibility');
            if (visibility?.text === 'pub') {
                const nameNode = struct.childForFieldName('name');
                if (nameNode) {
                    exports.push(nameNode.text);
                }
            }
        }

        // Find public enum items
        const enumItems = tree.rootNode.descendantsOfType('enum_item');
        for (const enumItem of enumItems) {
            const visibility = enumItem.childForFieldName('visibility');
            if (visibility?.text === 'pub') {
                const nameNode = enumItem.childForFieldName('name');
                if (nameNode) {
                    exports.push(nameNode.text);
                }
            }
        }

        return [...new Set(exports)]; // Remove duplicates
    }

    // C# import/export extraction (Tree-sitter AST-based)
    private extractCSharpImports(tree: Parser.Tree): string[] {
        const imports: string[] = [];

        // Find using directives
        const usingDirectives = tree.rootNode.descendantsOfType('using_directive');
        for (const directive of usingDirectives) {
            const nameNode = directive.childForFieldName('name');
            if (nameNode) {
                imports.push(nameNode.text);
            }
        }

        return [...new Set(imports)]; // Remove duplicates
    }

    private extractCSharpExports(tree: Parser.Tree): string[] {
        const exports: string[] = [];

        // Find class declarations
        const classDeclarations = tree.rootNode.descendantsOfType('class_declaration');
        for (const decl of classDeclarations) {
            const modifiers = decl.childForFieldName('modifiers');
            if (modifiers?.text.includes('public')) {
                const nameNode = decl.childForFieldName('name');
                if (nameNode) {
                    exports.push(nameNode.text);
                }
            }
        }

        // Find interface declarations
        const interfaceDeclarations = tree.rootNode.descendantsOfType('interface_declaration');
        for (const decl of interfaceDeclarations) {
            const modifiers = decl.childForFieldName('modifiers');
            if (modifiers?.text.includes('public')) {
                const nameNode = decl.childForFieldName('name');
                if (nameNode) {
                    exports.push(nameNode.text);
                }
            }
        }

        // Find struct declarations
        const structDeclarations = tree.rootNode.descendantsOfType('struct_declaration');
        for (const decl of structDeclarations) {
            const modifiers = decl.childForFieldName('modifiers');
            if (modifiers?.text.includes('public')) {
                const nameNode = decl.childForFieldName('name');
                if (nameNode) {
                    exports.push(nameNode.text);
                }
            }
        }

        return [...new Set(exports)]; // Remove duplicates
    }

    // PHP import/export extraction (Tree-sitter AST-based)
    private extractPHPImports(tree: Parser.Tree): string[] {
        const imports: string[] = [];

        // Find use declarations
        const useDeclarations = tree.rootNode.descendantsOfType('use_declaration');
        for (const decl of useDeclarations) {
            const nameNode = decl.childForFieldName('name');
            if (nameNode) {
                imports.push(nameNode.text);
            }
        }

        return [...new Set(imports)]; // Remove duplicates
    }

    private extractPHPExports(tree: Parser.Tree): string[] {
        const exports: string[] = [];

        // Find class declarations
        const classDeclarations = tree.rootNode.descendantsOfType('class_declaration');
        for (const decl of classDeclarations) {
            const nameNode = decl.childForFieldName('name');
            if (nameNode) {
                exports.push(nameNode.text);
            }
        }

        // Find interface declarations
        const interfaceDeclarations = tree.rootNode.descendantsOfType('interface_declaration');
        for (const decl of interfaceDeclarations) {
            const nameNode = decl.childForFieldName('name');
            if (nameNode) {
                exports.push(nameNode.text);
            }
        }

        // Find function definitions
        const functionDefinitions = tree.rootNode.descendantsOfType('function_definition');
        for (const func of functionDefinitions) {
            const nameNode = func.childForFieldName('name');
            if (nameNode) {
                exports.push(nameNode.text);
            }
        }

        return [...new Set(exports)]; // Remove duplicates
    }

    // Ruby import/export extraction (Tree-sitter AST-based)
    private extractRubyImports(tree: Parser.Tree): string[] {
        const imports: string[] = [];

        // Find call expressions for require/require_relative
        const callExpressions = tree.rootNode.descendantsOfType('call');
        for (const call of callExpressions) {
            const methodNode = call.childForFieldName('method');
            if (methodNode?.text === 'require' || methodNode?.text === 'require_relative') {
                const callArgs = call.childForFieldName('arguments');
                if (callArgs) {
                    const stringNodes = callArgs.descendantsOfType('string');
                    for (const stringNode of stringNodes) {
                        imports.push(stringNode.text.replace(/['"]/g, ''));
                    }
                }
            }
        }

        return [...new Set(imports)]; // Remove duplicates
    }

    private extractRubyExports(tree: Parser.Tree): string[] {
        const exports: string[] = [];

        // Find class definitions
        const classDefinitions = tree.rootNode.descendantsOfType('class');
        for (const cls of classDefinitions) {
            const nameNode = cls.childForFieldName('name');
            if (nameNode) {
                exports.push(nameNode.text);
            }
        }

        // Find module definitions
        const moduleDefinitions = tree.rootNode.descendantsOfType('module');
        for (const mod of moduleDefinitions) {
            const nameNode = mod.childForFieldName('name');
            if (nameNode) {
                exports.push(nameNode.text);
            }
        }

        // Find method definitions
        const methodDefinitions = tree.rootNode.descendantsOfType('method');
        for (const method of methodDefinitions) {
            const nameNode = method.childForFieldName('name');
            if (nameNode) {
                exports.push(nameNode.text);
            }
        }

        return [...new Set(exports)]; // Remove duplicates
    }

    private clusterIntoComponents(dependencies: DependencyInfo[]): ArchitectureComponent[] {
        // Phase 1: Build dependency graph
        const dependencyGraph = this.buildDependencyGraph(dependencies);

        // Phase 2: Find natural clusters using graph algorithms
        const clusters = this.findNaturalClusters(dependencyGraph, dependencies);

        // Phase 3: Classify each cluster using multi-dimensional analysis
        const components: ArchitectureComponent[] = [];
        const processedClusters = new Set<string>();

        for (const cluster of clusters) {
            if (cluster.files.length === 0) continue;

            const componentType = this.classifyClusterType(cluster, dependencies);
            const componentId = this.generateClusterId(cluster, componentType);

            if (!processedClusters.has(componentId)) {
                components.push({
                    id: componentId,
                    name: this.generateClusterName(cluster, componentType),
                    type: componentType,
                    files: cluster.files,
                    dependencies: cluster.dependencies
                });
                processedClusters.add(componentId);
            }
        }

        return components;
    }

    private buildDependencyGraph(dependencies: DependencyInfo[]): Map<string, Set<string>> {
        const graph = new Map<string, Set<string>>();
        const fileMap = new Map<string, DependencyInfo>();

        // Create file lookup map
        for (const dep of dependencies) {
            fileMap.set(dep.filePath, dep);
            graph.set(dep.filePath, new Set());
        }

        // Build dependency relationships
        for (const file of dependencies) {
            for (const importPath of file.imports) {
                const targetFile = this.resolveImportToFile(importPath, file.filePath, fileMap);
                if (targetFile && graph.has(targetFile)) {
                    graph.get(file.filePath)!.add(targetFile);
                }
            }
        }

        return graph;
    }

    private resolveImportToFile(importPath: string, sourceFile: string, fileMap: Map<string, DependencyInfo>): string | null {
        // Try exact match first
        if (fileMap.has(importPath)) {
            return importPath;
        }

        // Try relative path resolution
        const sourceDir = sourceFile.split('/').slice(0, -1).join('/');
        const possiblePaths = [
            `${sourceDir}/${importPath}`,
            `${sourceDir}/${importPath}.js`,
            `${sourceDir}/${importPath}.ts`,
            `${sourceDir}/${importPath}.jsx`,
            `${sourceDir}/${importPath}.tsx`,
            `${sourceDir}/${importPath}/index.js`,
            `${sourceDir}/${importPath}/index.ts`,
            `${sourceDir}/${importPath}/index.jsx`,
            `${sourceDir}/${importPath}/index.tsx`
        ];

        for (const path of possiblePaths) {
            if (fileMap.has(path)) {
                return path;
            }
        }

        // Try filename-only matching (for relative imports without extension)
        const importFileName = importPath.split('/').pop();
        if (importFileName) {
            for (const [filePath] of fileMap) {
                const fileName = filePath.split('/').pop()?.split('.')[0];
                if (fileName === importFileName) {
                    return filePath;
                }
            }
        }

        return null;
    }


    private findNaturalClusters(graph: Map<string, Set<string>>, dependencies: DependencyInfo[]): ComponentCluster[] {
        // Phase 1: Initial connected components
        const rawClusters = this.findConnectedComponents(graph, dependencies);

        // Phase 2: Semantic clustering - merge based on code similarity
        const semanticClusters = this.applySemanticClustering(rawClusters, dependencies);

        // Phase 3: Architectural pattern recognition
        const architecturalClusters = this.applyArchitecturalPatterns(semanticClusters, dependencies);

        // Phase 4: Final refinement
        return this.finalizeClusters(architecturalClusters, dependencies);
    }

    private findConnectedComponents(graph: Map<string, Set<string>>, dependencies: DependencyInfo[]): ComponentCluster[] {
        const visited = new Set<string>();
        const clusters: ComponentCluster[] = [];

        for (const filePath of graph.keys()) {
            if (!visited.has(filePath)) {
                const cluster = this.dfsCluster(filePath, graph, visited, dependencies);
                if (cluster.files.length > 0) {
                    clusters.push(cluster);
                }
            }
        }

        return clusters;
    }

    private dfsCluster(startFile: string, graph: Map<string, Set<string>>, visited: Set<string>, dependencies: DependencyInfo[]): ComponentCluster {
        const clusterFiles = new Set<string>();
        const stack = [startFile];
        const allDependencies = new Set<string>();

        while (stack.length > 0) {
            const currentFile = stack.pop()!;
            if (visited.has(currentFile)) continue;

            visited.add(currentFile);
            clusterFiles.add(currentFile);

            // Add outgoing dependencies
            const deps = graph.get(currentFile);
            if (deps) {
                for (const dep of deps) {
                    allDependencies.add(dep);
                    if (!visited.has(dep)) {
                        stack.push(dep);
                    }
                }
            }

            // Add incoming dependencies (reverse edges)
            for (const [file, deps] of graph) {
                if (deps.has(currentFile) && !visited.has(file)) {
                    stack.push(file);
                }
            }
        }

        // Separate internal vs external dependencies
        const externalDependencies = new Set<string>();
        for (const dep of allDependencies) {
            if (!clusterFiles.has(dep)) {
                externalDependencies.add(dep);
            }
        }

        return {
            files: Array.from(clusterFiles),
            dependencies: Array.from(externalDependencies), // Only external dependencies for relationship building
            metadata: this.analyzeClusterMetadata(Array.from(clusterFiles), dependencies)
        };
    }

    private applySemanticClustering(clusters: ComponentCluster[], dependencies: DependencyInfo[]): ComponentCluster[] {
        const fileMap = new Map(dependencies.map(d => [d.filePath, d]));

        // Phase 1: Architectural pattern-based grouping
        const architecturalGroups = this.groupByArchitecturalPurpose(clusters, fileMap);

        // Phase 2: Merge small clusters aggressively
        const mergedClusters = this.aggressiveSmallClusterMerging(architecturalGroups, fileMap);

        // Phase 3: Final semantic merging for remaining clusters
        return this.finalSemanticConsolidation(mergedClusters, fileMap);
    }

    private applyArchitecturalPatterns(clusters: ComponentCluster[], dependencies: DependencyInfo[]): ComponentCluster[] {
        const fileMap = new Map(dependencies.map(d => [d.filePath, d]));
        const result: ComponentCluster[] = [];

        for (const cluster of clusters) {
            // Apply architectural pattern recognition
            const patterns = this.recognizeArchitecturalPatterns(cluster, fileMap);

            if (patterns.isRouteHandler) {
                // Merge route handlers into API clusters
                const apiCluster = result.find(c => c.metadata?.architecturalType === 'api');
                if (apiCluster) {
                    apiCluster.files.push(...cluster.files);
                    apiCluster.dependencies.push(...cluster.dependencies);
                    continue;
                }
            }

            if (patterns.isDataModel) {
                // Merge data models into data clusters
                const dataCluster = result.find(c => c.metadata?.architecturalType === 'data');
                if (dataCluster) {
                    dataCluster.files.push(...cluster.files);
                    dataCluster.dependencies.push(...cluster.dependencies);
                    continue;
                }
            }

            // Add architectural metadata
            cluster.metadata = { ...cluster.metadata, ...patterns };
            result.push(cluster);
        }

        return result;
    }

    private finalizeClusters(clusters: ComponentCluster[], dependencies: DependencyInfo[]): ComponentCluster[] {
        const fileMap = new Map(dependencies.map(d => [d.filePath, d]));

        return clusters
            .filter(cluster => cluster.files.length > 0)
            .map(cluster => ({
                ...cluster,
                metadata: {
                    ...cluster.metadata,
                    ...this.analyzeClusterMetadata(cluster.files, dependencies)
                }
            }))
            .sort((a, b) => b.files.length - a.files.length); // Sort by size (largest first)
    }

    private groupByArchitecturalPurpose(clusters: ComponentCluster[], fileMap: Map<string, DependencyInfo>): ComponentCluster[] {
        const resultClusters: ComponentCluster[] = [];
        const processedClusters = new Set<ComponentCluster>();

        // Group by architectural purpose first
        const purposeGroups = this.createArchitecturalPurposeGroups(clusters, fileMap);

        // Convert purpose groups to consolidated clusters
        for (const [purpose, clusterGroup] of purposeGroups) {
            if (clusterGroup.length === 1) {
                resultClusters.push(clusterGroup[0]);
            } else {
                resultClusters.push(this.mergeClustersByPurpose(clusterGroup, purpose, fileMap));
            }
        }

        return resultClusters;
    }

    private createArchitecturalPurposeGroups(clusters: ComponentCluster[], fileMap: Map<string, DependencyInfo>): Map<string, ComponentCluster[]> {
        const purposeGroups = new Map<string, ComponentCluster[]>();

        for (const cluster of clusters) {
            const purpose = this.determineClusterArchitecturalPurpose(cluster, fileMap);

            if (!purposeGroups.has(purpose)) {
                purposeGroups.set(purpose, []);
            }
            purposeGroups.get(purpose)!.push(cluster);
        }

        return purposeGroups;
    }

    private determineClusterArchitecturalPurpose(cluster: ComponentCluster, fileMap: Map<string, DependencyInfo>): string {
        const files = cluster.files.map(f => fileMap.get(f)).filter(Boolean) as DependencyInfo[];
        const patterns = this.analyzeFilePatterns(files);

        // Determine primary architectural purpose
        if (this.isApiPurpose(files, patterns)) return 'api';
        if (this.isUiPurpose(files, patterns)) return 'ui';
        if (this.isDataPurpose(files, patterns)) return 'data';
        if (this.isBusinessPurpose(files, patterns)) return 'business';
        if (this.isInfraPurpose(files, patterns)) return 'infra';
        if (this.isConfigPurpose(files, patterns)) return 'config';
        if (this.isMiddlewarePurpose(files, patterns)) return 'middleware';
        if (this.isEntryPurpose(files, patterns)) return 'entry';

        return 'utility'; // Default
    }

    private isApiPurpose(files: DependencyInfo[], patterns: any): boolean {
        // Check for API/Backend framework imports
        if (patterns.frameworks?.has('express') || patterns.frameworks?.has('fastify') ||
            patterns.frameworks?.has('nestjs') || patterns.frameworks?.has('koa') ||
            patterns.frameworks?.has('hapi') || patterns.frameworks?.has('sails') ||
            patterns.frameworks?.has('loopback') || patterns.frameworks?.has('adonis') ||
            patterns.frameworks?.has('strapi') || patterns.frameworks?.has('graphql')) {
            return true;
        }

        // Check for API documentation or REST libraries
        if (patterns.libraries?.has('rest-api') || patterns.libraries?.has('api-docs')) {
            return true;
        }

        // Check file content and naming patterns
        return files.some(f => {
            const content = [...f.imports, ...f.exports].join(' ').toLowerCase();
            const fileName = f.filePath.toLowerCase();
            return content.includes('router.') || content.includes('app.get') ||
                content.includes('app.post') || content.includes('app.put') ||
                content.includes('app.delete') || content.includes('route') ||
                content.includes('middleware') || content.includes('endpoint') ||
                fileName.includes('route') || fileName.includes('controller') ||
                fileName.includes('handler') || fileName.includes('endpoint') ||
                fileName.includes('api') || fileName.includes('middleware');
        }) || patterns.hasHttpCalls;
    }

    private isUiPurpose(files: DependencyInfo[], patterns: any): boolean {
        // Check for UI framework imports
        if (patterns.frameworks?.has('react') || patterns.frameworks?.has('vue') ||
            patterns.frameworks?.has('angular') || patterns.frameworks?.has('svelte') ||
            patterns.frameworks?.has('nextjs') || patterns.frameworks?.has('nuxt') ||
            patterns.frameworks?.has('gatsby') || patterns.frameworks?.has('remix') ||
            patterns.frameworks?.has('solid') || patterns.frameworks?.has('lit') ||
            patterns.frameworks?.has('stencil')) {
            return true;
        }

        // Check file content and language
        return files.some(f => {
            const content = [...f.imports, ...f.exports].join(' ').toLowerCase();
            return f.language === 'tsx' || f.language === 'jsx' ||
                content.includes('render') || content.includes('component') ||
                content.includes('template') || content.includes('<') ||
                patterns.hasReact || patterns.returnsJsx || patterns.hasEventHandlers;
        });
    }

    private isDataPurpose(files: DependencyInfo[], patterns: any): boolean {
        // Check for data/ORM framework imports
        if (patterns.frameworks?.has('mongoose') || patterns.frameworks?.has('sequelize') ||
            patterns.frameworks?.has('typeorm') || patterns.frameworks?.has('prisma') ||
            patterns.frameworks?.has('mikro-orm')) {
            return true;
        }

        // Check for database driver imports
        if (patterns.libraries?.has('mongodb') || patterns.libraries?.has('mysql') ||
            patterns.libraries?.has('postgres') || patterns.libraries?.has('sqlite') ||
            patterns.libraries?.has('redis') || patterns.libraries?.has('elasticsearch') ||
            patterns.libraries?.has('cassandra') || patterns.libraries?.has('neo4j') ||
            patterns.libraries?.has('supabase')) {
            return true;
        }

        // Check file content and naming
        return files.some(f => {
            const content = [...f.imports, ...f.exports].join(' ').toLowerCase();
            const fileName = f.filePath.toLowerCase();
            return content.includes('model') || content.includes('schema') ||
                content.includes('entity') || content.includes('repository') ||
                content.includes('dao') || content.includes('database') ||
                content.includes('migration') || content.includes('seed') ||
                fileName.includes('model') || fileName.includes('schema') ||
                fileName.includes('entity') || fileName.includes('repository') ||
                fileName.includes('dao') || fileName.includes('migration');
        }) || patterns.libraries?.has('orm') || patterns.hasDatabaseCalls;
    }

    private isBusinessPurpose(files: DependencyInfo[], patterns: any): boolean {
        return files.some(f => {
            const fileName = f.filePath.toLowerCase();
            return fileName.includes('service') || fileName.includes('manager') ||
                fileName.includes('logic') || fileName.includes('processor') ||
                fileName.includes('workflow');
        }) && patterns.importPatterns.length > 2;
    }

    private isInfraPurpose(files: DependencyInfo[], patterns: any): boolean {
        // Check for cloud provider libraries and BaaS platforms
        if (patterns.libraries?.has('aws') || patterns.libraries?.has('google-cloud') ||
            patterns.libraries?.has('azure') || patterns.libraries?.has('container-orchestration') ||
            patterns.libraries?.has('supabase')) {
            return true;
        }

        // Check for messaging/caching libraries
        if (patterns.libraries?.has('message-queue') || patterns.libraries?.has('caching') ||
            patterns.libraries?.has('logging')) {
            return true;
        }

        // Check for HTTP client libraries (these are infrastructure)
        if (patterns.libraries?.has('http-client')) {
            return true;
        }

        // Check file content and naming patterns
        return files.some(f => {
            const content = [...f.imports, ...f.exports].join(' ').toLowerCase();
            const fileName = f.filePath.toLowerCase();
            return content.includes('axios') || content.includes('fetch') ||
                content.includes('http') || content.includes('client') ||
                content.includes('provider') || content.includes('adapter') ||
                content.includes('service') || content.includes('integration') ||
                fileName.includes('client') || fileName.includes('provider') ||
                fileName.includes('adapter') || fileName.includes('service') ||
                fileName.includes('integration') || fileName.includes('external');
        });
    }

    private isConfigPurpose(files: DependencyInfo[], patterns: any): boolean {
        return files.some(f => {
            const content = [...f.imports, ...f.exports].join(' ').toLowerCase();
            const fileName = f.filePath.toLowerCase();
            return content.includes('dotenv') || content.includes('process.env') ||
                fileName.includes('config') || fileName.includes('settings') ||
                fileName.includes('env');
        }) || patterns.libraries?.has('config');
    }

    private isMiddlewarePurpose(files: DependencyInfo[], patterns: any): boolean {
        return files.some(f => {
            const fileName = f.filePath.toLowerCase();
            return fileName.includes('middleware') || fileName.includes('interceptor') ||
                fileName.includes('hook') || fileName.includes('decorator') ||
                fileName.includes('plugin');
        }) || (patterns.hasExports && patterns.hasImports && patterns.importPatterns.length > 5);
    }

    private isEntryPurpose(files: DependencyInfo[], patterns: any): boolean {
        return files.some(f => {
            const fileName = f.filePath.toLowerCase();
            return fileName.includes('main.') || fileName.includes('app.') ||
                fileName.includes('index.') || fileName.includes('server.') ||
                fileName.includes('start.');
        }) || (patterns.hasExports && patterns.importPatterns.length > 3);
    }

    private mergeClustersByPurpose(clusters: ComponentCluster[], purpose: string, fileMap: Map<string, DependencyInfo>): ComponentCluster {
        const mergedFiles = new Set<string>();
        const allDeps = new Set<string>();

        // Collect all files and all dependencies from all clusters
        for (const cluster of clusters) {
            cluster.files.forEach(f => mergedFiles.add(f));
            cluster.dependencies.forEach(d => allDeps.add(d));
        }

        // Filter to only external dependencies (those not in merged files)
        const externalDeps = new Set<string>();
        for (const dep of allDeps) {
            if (!mergedFiles.has(dep)) {
                externalDeps.add(dep);
            }
        }

        return {
            files: Array.from(mergedFiles),
            dependencies: Array.from(externalDeps),
            metadata: {
                architecturalPurpose: purpose,
                ...this.analyzeClusterMetadata(Array.from(mergedFiles), Array.from(fileMap.values()))
            }
        };
    }

    private aggressiveSmallClusterMerging(clusters: ComponentCluster[], fileMap: Map<string, DependencyInfo>): ComponentCluster[] {
        const mergedClusters: ComponentCluster[] = [];
        const smallClusters: ComponentCluster[] = [];
        const largeClusters: ComponentCluster[] = [];

        // Separate small vs large clusters
        for (const cluster of clusters) {
            if (cluster.files.length <= 3) {
                smallClusters.push(cluster);
            } else {
                largeClusters.push(cluster);
            }
        }

        // Add large clusters as-is
        mergedClusters.push(...largeClusters);

        // Aggressively merge small clusters
        while (smallClusters.length > 0) {
            const currentSmall = smallClusters.shift()!;
            let merged = false;

            // Try to merge with existing merged clusters
            for (let i = 0; i < mergedClusters.length; i++) {
                if (this.shouldMergeClusters(currentSmall, mergedClusters[i], fileMap)) {
                    mergedClusters[i].files.push(...currentSmall.files);
                    mergedClusters[i].dependencies.push(...currentSmall.dependencies);
                    merged = true;
                    break;
                }
            }

            // If couldn't merge, try to find other small clusters to merge with
            if (!merged) {
                const mergeCandidates = smallClusters.filter(c =>
                    this.shouldMergeClusters(currentSmall, c, fileMap)
                );

                if (mergeCandidates.length > 0) {
                    const bestMatch = mergeCandidates[0];
                    const mergedCluster = this.mergeClusters([currentSmall, bestMatch], fileMap);
                    mergedClusters.push(mergedCluster);
                    smallClusters.splice(smallClusters.indexOf(bestMatch), 1);
                    merged = true;
                }
            }

            // If still couldn't merge, add as-is (but this should be rare)
            if (!merged) {
                mergedClusters.push(currentSmall);
            }
        }

        return mergedClusters;
    }

    private shouldMergeClusters(cluster1: ComponentCluster, cluster2: ComponentCluster, fileMap: Map<string, DependencyInfo>): boolean {
        // Check architectural purpose compatibility
        const purpose1 = cluster1.metadata?.architecturalPurpose || this.determineClusterArchitecturalPurpose(cluster1, fileMap);
        const purpose2 = cluster2.metadata?.architecturalPurpose || this.determineClusterArchitecturalPurpose(cluster2, fileMap);

        // Same purpose = always merge
        if (purpose1 === purpose2) return true;

        // Compatible purposes can merge
        const compatiblePurposes: Record<string, string[]> = {
            'api': ['middleware', 'infra'],
            'ui': ['middleware'],
            'data': ['business', 'middleware'],
            'business': ['data', 'middleware'],
            'middleware': ['api', 'ui', 'data', 'business', 'infra'],
            'infra': ['api', 'middleware'],
            'config': ['middleware'],
            'entry': ['api', 'middleware']
        };

        return compatiblePurposes[purpose1]?.includes(purpose2) ||
            compatiblePurposes[purpose2]?.includes(purpose1) ||
            false;
    }

    private finalSemanticConsolidation(clusters: ComponentCluster[], fileMap: Map<string, DependencyInfo>): ComponentCluster[] {
        // Final pass to merge any remaining very small clusters
        const finalClusters: ComponentCluster[] = [];
        const tinyClusters: ComponentCluster[] = [];

        for (const cluster of clusters) {
            if (cluster.files.length === 1) {
                tinyClusters.push(cluster);
            } else {
                finalClusters.push(cluster);
            }
        }

        // Try to merge single-file clusters with best matches
        for (const tinyCluster of tinyClusters) {
            let merged = false;

            for (let i = 0; i < finalClusters.length && !merged; i++) {
                if (this.shouldMergeClusters(tinyCluster, finalClusters[i], fileMap)) {
                    finalClusters[i].files.push(...tinyCluster.files);
                    finalClusters[i].dependencies.push(...tinyCluster.dependencies);
                    merged = true;
                }
            }

            if (!merged) {
                // Create a small utility cluster for orphans
                const orphanCluster = finalClusters.find(c => c.metadata?.isOrphanCollector);
                if (orphanCluster) {
                    orphanCluster.files.push(...tinyCluster.files);
                    orphanCluster.dependencies.push(...tinyCluster.dependencies);
                } else {
                    // Create new orphan collector
                    finalClusters.push({
                        ...tinyCluster,
                        metadata: { ...tinyCluster.metadata, isOrphanCollector: true }
                    });
                }
            }
        }

        return finalClusters;
    }

    private groupBySemanticSimilarity(clusters: ComponentCluster[], fileMap: Map<string, DependencyInfo>): ComponentCluster[][] {
        const groups: ComponentCluster[][] = [];

        for (const cluster of clusters) {
            let foundGroup = false;

            for (const group of groups) {
                if (this.areSemanticallySimilar(cluster, group[0], fileMap)) {
                    group.push(cluster);
                    foundGroup = true;
                    break;
                }
            }

            if (!foundGroup) {
                groups.push([cluster]);
            }
        }

        return groups;
    }

    private areSemanticallySimilar(cluster1: ComponentCluster, cluster2: ComponentCluster, fileMap: Map<string, DependencyInfo>): boolean {
        const files1 = cluster1.files.map(f => fileMap.get(f)).filter(Boolean) as DependencyInfo[];
        const files2 = cluster2.files.map(f => fileMap.get(f)).filter(Boolean) as DependencyInfo[];

        // Check if they share similar import patterns
        const imports1 = new Set(files1.flatMap(f => f.imports));
        const imports2 = new Set(files2.flatMap(f => f.imports));
        const sharedImports = new Set([...imports1].filter(x => imports2.has(x)));

        // Check if they have similar functionality patterns
        const patterns1 = this.extractFunctionalityPatterns(files1);
        const patterns2 = this.extractFunctionalityPatterns(files2);

        const similarity = (sharedImports.size / Math.max(imports1.size, imports2.size)) +
            (this.patternSimilarity(patterns1, patterns2) * 0.5);

        return similarity > 0.3; // 30% similarity threshold
    }

    private extractFunctionalityPatterns(files: DependencyInfo[]): any {
        const patterns = {
            hasAsyncFunctions: false,
            hasDatabaseCalls: false,
            hasHttpCalls: false,
            hasFileOperations: false,
            returnsJsx: false,
            hasEventHandlers: false,
            hasValidation: false
        };

        for (const file of files) {
            const allContent = [...file.imports, ...file.exports].join(' ').toLowerCase();

            // Async operations
            patterns.hasAsyncFunctions = patterns.hasAsyncFunctions ||
                allContent.includes('async') || allContent.includes('promise') ||
                allContent.includes('await') || allContent.includes('observable');

            // Database operations (expanded)
            patterns.hasDatabaseCalls = patterns.hasDatabaseCalls ||
                allContent.includes('query') || allContent.includes('find') || allContent.includes('save') ||
                allContent.includes('insert') || allContent.includes('update') || allContent.includes('delete') ||
                allContent.includes('select') || allContent.includes('create') || allContent.includes('drop');

            // HTTP operations (expanded)
            patterns.hasHttpCalls = patterns.hasHttpCalls ||
                allContent.includes('fetch') || allContent.includes('axios') || allContent.includes('http') ||
                allContent.includes('request') || allContent.includes('response') || allContent.includes('api') ||
                allContent.includes('rest') || allContent.includes('graphql') || allContent.includes('apollo');

            // File operations (expanded)
            patterns.hasFileOperations = patterns.hasFileOperations ||
                allContent.includes('fs') || allContent.includes('readfile') || allContent.includes('writefile') ||
                allContent.includes('stream') || allContent.includes('buffer') || allContent.includes('path');

            // UI patterns (expanded)
            patterns.returnsJsx = patterns.returnsJsx ||
                file.language === 'typescript' || file.language === 'tsx' || file.language === 'jsx' ||
                allContent.includes('render') || allContent.includes('component') || allContent.includes('template');

            // Event handlers (expanded)
            patterns.hasEventHandlers = patterns.hasEventHandlers ||
                allContent.includes('onclick') || allContent.includes('onchange') || allContent.includes('onsubmit') ||
                allContent.includes('onmouseover') || allContent.includes('onmouseout') || allContent.includes('onload') ||
                allContent.includes('addeventlistener') || allContent.includes('eventlistener');

            // Validation (expanded)
            patterns.hasValidation = patterns.hasValidation ||
                allContent.includes('validate') || allContent.includes('required') || allContent.includes('schema') ||
                allContent.includes('joi') || allContent.includes('yup') || allContent.includes('zod') ||
                allContent.includes('validator') || allContent.includes('validation');
        }

        return patterns;
    }

    private patternSimilarity(patterns1: any, patterns2: any): number {
        const keys = Object.keys(patterns1);
        let matches = 0;

        for (const key of keys) {
            if (patterns1[key] === patterns2[key]) {
                matches++;
            }
        }

        return matches / keys.length;
    }

    private mergeClusters(clusters: ComponentCluster[], fileMap: Map<string, DependencyInfo>): ComponentCluster {
        const mergedFiles = new Set<string>();
        const allDeps = new Set<string>();

        // Collect all files and all dependencies from all clusters
        for (const cluster of clusters) {
            cluster.files.forEach(f => mergedFiles.add(f));
            cluster.dependencies.forEach(d => allDeps.add(d));
        }

        // Filter to only external dependencies (those not in merged files)
        const externalDeps = new Set<string>();
        for (const dep of allDeps) {
            if (!mergedFiles.has(dep)) {
                externalDeps.add(dep);
            }
        }

        return {
            files: Array.from(mergedFiles),
            dependencies: Array.from(externalDeps),
            metadata: this.analyzeClusterMetadata(Array.from(mergedFiles), Array.from(fileMap.values()))
        };
    }

    private recognizeArchitecturalPatterns(cluster: ComponentCluster, fileMap: Map<string, DependencyInfo>): any {
        const files = cluster.files.map(f => fileMap.get(f)).filter(Boolean) as DependencyInfo[];
        const patterns = {
            isRouteHandler: false,
            isDataModel: false,
            isMiddleware: false,
            isUtility: false,
            isComponent: false,
            isConfig: false,
            isAuth: false
        };

        for (const file of files) {
            const allContent = [...file.imports, ...file.exports].join(' ').toLowerCase();
            const fileName = file.filePath.toLowerCase();

            // Route handlers
            patterns.isRouteHandler = patterns.isRouteHandler ||
                fileName.includes('route') || fileName.includes('controller') ||
                allContent.includes('router.') || allContent.includes('app.') ||
                allContent.includes('get(') || allContent.includes('post(') || allContent.includes('put(') || allContent.includes('delete(');

            // Data models
            patterns.isDataModel = patterns.isDataModel ||
                fileName.includes('model') || fileName.includes('schema') || fileName.includes('entity') ||
                allContent.includes('mongoose') || allContent.includes('sequelize') || allContent.includes('typeorm') ||
                allContent.includes('supabase') || allContent.includes('interface ') || allContent.includes('class ');

            // Middleware
            patterns.isMiddleware = patterns.isMiddleware ||
                fileName.includes('middleware') || fileName.includes('interceptor') ||
                allContent.includes('next(') || allContent.includes('req, res');

            // React/Vue components
            patterns.isComponent = patterns.isComponent ||
                file.language === 'tsx' || file.language === 'jsx' ||
                allContent.includes('react') || allContent.includes('vue') ||
                allContent.includes('component') || allContent.includes('render(');

            // Configuration
            patterns.isConfig = patterns.isConfig ||
                fileName.includes('config') || fileName.includes('settings') || fileName.includes('env') ||
                allContent.includes('process.env') || allContent.includes('dotenv');

            // Authentication
            patterns.isAuth = patterns.isAuth ||
                fileName.includes('auth') || fileName.includes('login') || fileName.includes('security') ||
                allContent.includes('passport') || allContent.includes('jwt') || allContent.includes('oauth') ||
                allContent.includes('bcrypt') || allContent.includes('crypto');

            // Utilities
            patterns.isUtility = patterns.isUtility ||
                fileName.includes('util') || fileName.includes('helper') || fileName.includes('common') ||
                (file.imports.length > 5 && file.exports.length > 3); // High connectivity suggests utility
        }

        return patterns;
    }


    private analyzeClusterMetadata(files: string[], dependencies: DependencyInfo[]): any {
        const fileInfos = files.map(f => dependencies.find(d => d.filePath === f)).filter(Boolean) as DependencyInfo[];
        return {
            language: this.detectDominantLanguage(fileInfos),
            hasExternalDeps: fileInfos.some(f => f.imports.some(imp => imp.startsWith('.') === false)),
            avgImports: fileInfos.reduce((sum, f) => sum + f.imports.length, 0) / fileInfos.length,
            avgExports: fileInfos.reduce((sum, f) => sum + f.exports.length, 0) / fileInfos.length
        };
    }

    private detectDominantLanguage(files: DependencyInfo[]): string {
        const languages = files.map(f => f.language);
        const counts = languages.reduce((acc, lang) => {
            acc[lang] = (acc[lang] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    }

    private generateClusterId(cluster: ComponentCluster, type: ArchitectureComponent['type']): string {
        // Create a deterministic ID based on cluster content
        const sortedFiles = [...cluster.files].sort();
        const hash = this.simpleHash(sortedFiles.join('|'));
        return `${type}_${hash}`;
    }

    private generateClusterName(cluster: ComponentCluster, type: ArchitectureComponent['type']): string {
        const fileCount = cluster.files.length;
        const dominantLang = cluster.metadata?.language || 'mixed';

        return `${this.getComponentTypeLabel(type)} (${fileCount} files, ${dominantLang})`;
    }

    private classifyClusterType(cluster: ComponentCluster, dependencies: DependencyInfo[]): ArchitectureComponent['type'] {
        const files = cluster.files.map(f => dependencies.find(d => d.filePath === f)).filter(Boolean) as DependencyInfo[];
        const metadata = cluster.metadata;

        // Multi-dimensional classification
        const signals = this.analyzeClusterSignals(cluster, files);

        // Apply classification logic based on multiple signals
        return this.determineComponentType(signals, metadata);
    }

    private analyzeClusterSignals(cluster: ComponentCluster, files: DependencyInfo[]): any {
        return {
            filePatterns: this.analyzeFilePatterns(files),
            namingPatterns: this.analyzeNamingPatterns(cluster.files),
            dependencyPatterns: this.analyzeDependencyPatterns(cluster, files),
            structuralPatterns: this.analyzeStructuralPatterns(cluster.files),
            contentPatterns: this.analyzeContentPatterns(files),
            centralityScore: this.calculateClusterCentrality(cluster)
        };
    }

    private analyzeNamingPatterns(filePaths: string[]): any {
        const patterns = {
            hasMainFiles: false,
            hasApiFiles: false,
            hasBusinessFiles: false,
            hasDataFiles: false,
            hasUiFiles: false,
            hasUtilFiles: false,
            hasConfigFiles: false,
            hasTestFiles: false
        };

        const fileNames = filePaths.map(p => p.toLowerCase());

        patterns.hasMainFiles = fileNames.some(f =>
            f.includes('main.') || f.includes('app.') || f.includes('index.') ||
            f.includes('server.') || f.includes('start.')
        );

        patterns.hasApiFiles = fileNames.some(f =>
            f.includes('route') || f.includes('controller') || f.includes('handler') ||
            f.includes('endpoint') || f.includes('api')
        );

        patterns.hasBusinessFiles = fileNames.some(f =>
            f.includes('service') || f.includes('manager') || f.includes('processor') ||
            f.includes('logic') || f.includes('domain')
        );

        patterns.hasDataFiles = fileNames.some(f =>
            f.includes('model') || f.includes('entity') || f.includes('schema') ||
            f.includes('repository') || f.includes('dao')
        );

        patterns.hasUiFiles = fileNames.some(f =>
            f.includes('component') || f.includes('view') || f.includes('page') ||
            f.includes('screen') || f.includes('ui')
        );

        patterns.hasUtilFiles = fileNames.some(f =>
            f.includes('util') || f.includes('helper') || f.includes('common') ||
            f.includes('shared') || f.includes('lib')
        );

        patterns.hasConfigFiles = fileNames.some(f =>
            f.includes('config') || f.includes('settings') || f.includes('env') ||
            f.includes('constants')
        );

        patterns.hasTestFiles = fileNames.some(f =>
            f.includes('test') || f.includes('spec') || f.includes('.test.') ||
            f.includes('.spec.')
        );

        return patterns;
    }

    private analyzeDependencyPatterns(cluster: ComponentCluster, files: DependencyInfo[]): any {
        const patterns = {
            internalDeps: 0,
            externalDeps: 0,
            importCount: 0,
            exportCount: 0,
            hasCircularDeps: false,
            dependencyDiversity: 0
        };

        const clusterFileSet = new Set(cluster.files);

        for (const file of files) {
            patterns.importCount += file.imports.length;
            patterns.exportCount += file.exports.length;

            for (const imp of file.imports) {
                if (clusterFileSet.has(imp)) {
                    patterns.internalDeps++;
                } else {
                    patterns.externalDeps++;
                }
            }
        }

        // Calculate dependency diversity (unique external dependencies)
        const uniqueExternalDeps = new Set<string>();
        for (const file of files) {
            for (const imp of file.imports) {
                if (!clusterFileSet.has(imp)) {
                    uniqueExternalDeps.add(imp);
                }
            }
        }
        patterns.dependencyDiversity = uniqueExternalDeps.size;

        return patterns;
    }

    private analyzeStructuralPatterns(filePaths: string[]): any {
        const patterns = {
            commonPrefix: this.findCommonPathPrefix(filePaths),
            directoryDepth: 0,
            isFlatStructure: false,
            hasStandardDirs: false
        };

        if (filePaths.length > 0) {
            const dirs = filePaths.map(p => p.split('/').slice(0, -1).join('/'));
            patterns.directoryDepth = Math.max(...dirs.map(d => d.split('/').length));
            patterns.isFlatStructure = new Set(dirs).size === 1;

            // Check for standard directory patterns
            const dirNames = new Set(dirs.flatMap(d => d.split('/')));
            patterns.hasStandardDirs = ['src', 'lib', 'app', 'components', 'services', 'models', 'routes', 'controllers']
                .some(std => dirNames.has(std));
        }

        return patterns;
    }

    private findCommonPathPrefix(paths: string[]): string {
        if (paths.length === 0) return '';
        if (paths.length === 1) return paths[0].split('/').slice(0, -1).join('/');

        const splitPaths = paths.map(p => p.split('/'));
        let commonPrefix = [];

        for (let i = 0; i < splitPaths[0].length; i++) {
            const segment = splitPaths[0][i];
            if (splitPaths.every(p => p[i] === segment)) {
                commonPrefix.push(segment);
            } else {
                break;
            }
        }

        return commonPrefix.join('/');
    }

    private analyzeContentPatterns(files: DependencyInfo[]): any {
        // Analyze content-based patterns (frameworks, libraries, etc.)
        const patterns = {
            frameworks: new Set<string>(),
            libraries: new Set<string>(),
            languages: new Set<string>(),
            patterns: new Set<string>()
        };

        for (const file of files) {
            patterns.languages.add(file.language);

            const allContent = [...file.imports, ...file.exports].join(' ').toLowerCase();

            // UI Framework Detection (comprehensive)
            if (allContent.includes('react') || allContent.includes('@types/react') || allContent.includes('react-dom')) patterns.frameworks.add('react');
            if (allContent.includes('vue') || allContent.includes('@vue/') || allContent.includes('vue-router')) patterns.frameworks.add('vue');
            if (allContent.includes('angular') || allContent.includes('@angular/') || allContent.includes('ng/')) patterns.frameworks.add('angular');
            if (allContent.includes('svelte') || allContent.includes('@svelte/')) patterns.frameworks.add('svelte');
            if (allContent.includes('next') || allContent.includes('next/') || allContent.includes('@next/')) patterns.frameworks.add('nextjs');
            if (allContent.includes('nuxt') || allContent.includes('@nuxt/')) patterns.frameworks.add('nuxt');
            if (allContent.includes('gatsby') || allContent.includes('@gatsby/')) patterns.frameworks.add('gatsby');
            if (allContent.includes('remix') || allContent.includes('@remix-run/')) patterns.frameworks.add('remix');
            if (allContent.includes('solid') || allContent.includes('solid-js')) patterns.frameworks.add('solid');
            if (allContent.includes('lit') || allContent.includes('lit-element')) patterns.frameworks.add('lit');
            if (allContent.includes('stencil') || allContent.includes('@stencil/')) patterns.frameworks.add('stencil');

            // Backend/API Framework Detection (comprehensive)
            if (allContent.includes('express') || allContent.includes('@types/express')) patterns.frameworks.add('express');
            if (allContent.includes('fastify') || allContent.includes('@fastify/')) patterns.frameworks.add('fastify');
            if (allContent.includes('nestjs') || allContent.includes('@nestjs/')) patterns.frameworks.add('nestjs');
            if (allContent.includes('koa') || allContent.includes('@koa/')) patterns.frameworks.add('koa');
            if (allContent.includes('hapi') || allContent.includes('@hapi/')) patterns.frameworks.add('hapi');
            if (allContent.includes('sails') || allContent.includes('@sails/')) patterns.frameworks.add('sails');
            if (allContent.includes('loopback') || allContent.includes('@loopback/')) patterns.frameworks.add('loopback');
            if (allContent.includes('adonis') || allContent.includes('@adonisjs/')) patterns.frameworks.add('adonis');
            if (allContent.includes('strapi') || allContent.includes('@strapi/')) patterns.frameworks.add('strapi');

            // Data/Database Framework Detection (comprehensive)
            if (allContent.includes('mongoose') || allContent.includes('@types/mongoose')) patterns.frameworks.add('mongoose');
            if (allContent.includes('sequelize') || allContent.includes('@types/sequelize')) patterns.frameworks.add('sequelize');
            if (allContent.includes('typeorm') || allContent.includes('@types/typeorm')) patterns.frameworks.add('typeorm');
            if (allContent.includes('prisma') || allContent.includes('@prisma/')) patterns.frameworks.add('prisma');
            if (allContent.includes('mikro-orm') || allContent.includes('@mikro-orm/')) patterns.frameworks.add('mikro-orm');
            if (allContent.includes('mongodb') || allContent.includes('@types/mongodb')) patterns.libraries.add('mongodb');
            if (allContent.includes('mysql') || allContent.includes('@types/mysql')) patterns.libraries.add('mysql');
            if (allContent.includes('pg') || allContent.includes('postgres') || allContent.includes('@types/pg')) patterns.libraries.add('postgres');
            if (allContent.includes('sqlite') || allContent.includes('@types/sqlite')) patterns.libraries.add('sqlite');
            if (allContent.includes('redis') || allContent.includes('@types/redis')) patterns.libraries.add('redis');
            if (allContent.includes('elasticsearch') || allContent.includes('@elastic/')) patterns.libraries.add('elasticsearch');
            if (allContent.includes('cassandra') || allContent.includes('@types/cassandra')) patterns.libraries.add('cassandra');
            if (allContent.includes('neo4j') || allContent.includes('@types/neo4j')) patterns.libraries.add('neo4j');
            if (allContent.includes('supabase') || allContent.includes('@supabase/')) patterns.libraries.add('supabase');

            // API/GraphQL Detection
            if (allContent.includes('graphql') || allContent.includes('@graphql/') || allContent.includes('apollo')) patterns.frameworks.add('graphql');
            if (allContent.includes('restify') || allContent.includes('@types/restify')) patterns.libraries.add('rest-api');
            if (allContent.includes('swagger') || allContent.includes('openapi')) patterns.libraries.add('api-docs');

            // Infrastructure/Cloud Detection
            if (allContent.includes('aws-sdk') || allContent.includes('@aws-sdk/')) patterns.libraries.add('aws');
            if (allContent.includes('@google-cloud/') || allContent.includes('firebase')) patterns.libraries.add('google-cloud');
            if (allContent.includes('@azure/') || allContent.includes('azure-')) patterns.libraries.add('azure');
            if (allContent.includes('docker') || allContent.includes('kubernetes') || allContent.includes('k8s')) patterns.libraries.add('container-orchestration');

            // HTTP Client Libraries (expanded)
            if (allContent.includes('axios') || allContent.includes('@types/axios')) patterns.libraries.add('http-client');
            if (allContent.includes('got') || allContent.includes('@types/got')) patterns.libraries.add('http-client');
            if (allContent.includes('node-fetch') || allContent.includes('@types/node-fetch')) patterns.libraries.add('http-client');
            if (allContent.includes('superagent') || allContent.includes('@types/superagent')) patterns.libraries.add('http-client');
            if (allContent.includes('request') || allContent.includes('@types/request')) patterns.libraries.add('http-client');

            // Authentication Libraries (expanded)
            if (allContent.includes('passport') || allContent.includes('@types/passport')) patterns.libraries.add('auth');
            if (allContent.includes('jwt') || allContent.includes('jsonwebtoken') || allContent.includes('@types/jsonwebtoken')) patterns.libraries.add('auth');
            if (allContent.includes('bcrypt') || allContent.includes('@types/bcrypt')) patterns.libraries.add('auth');
            if (allContent.includes('crypto') || allContent.includes('@types/crypto')) patterns.libraries.add('auth');
            if (allContent.includes('oauth') || allContent.includes('@types/oauth')) patterns.libraries.add('auth');
            if (allContent.includes('supabase') || allContent.includes('@supabase/')) patterns.libraries.add('auth');

            // Configuration Libraries (expanded)
            if (allContent.includes('dotenv') || allContent.includes('@types/dotenv')) patterns.libraries.add('config');
            if (allContent.includes('convict') || allContent.includes('@types/convict')) patterns.libraries.add('config');
            if (allContent.includes('config') || allContent.includes('@types/config')) patterns.libraries.add('config');
            if (allContent.includes('nconf') || allContent.includes('@types/nconf')) patterns.libraries.add('config');

            // Testing Libraries
            if (allContent.includes('jest') || allContent.includes('@types/jest')) patterns.libraries.add('testing');
            if (allContent.includes('mocha') || allContent.includes('@types/mocha')) patterns.libraries.add('testing');
            if (allContent.includes('chai') || allContent.includes('@types/chai')) patterns.libraries.add('testing');
            if (allContent.includes('cypress') || allContent.includes('@types/cypress')) patterns.libraries.add('testing');
            if (allContent.includes('playwright') || allContent.includes('@playwright/')) patterns.libraries.add('testing');

            // Logging Libraries
            if (allContent.includes('winston') || allContent.includes('@types/winston')) patterns.libraries.add('logging');
            if (allContent.includes('bunyan') || allContent.includes('@types/bunyan')) patterns.libraries.add('logging');
            if (allContent.includes('pino') || allContent.includes('@types/pino')) patterns.libraries.add('logging');

            // Caching Libraries
            if (allContent.includes('node-cache') || allContent.includes('@types/node-cache')) patterns.libraries.add('caching');
            if (allContent.includes('memcached') || allContent.includes('@types/memcached')) patterns.libraries.add('caching');

            // Message Queue Libraries
            if (allContent.includes('amqp') || allContent.includes('@types/amqp')) patterns.libraries.add('message-queue');
            if (allContent.includes('kafka') || allContent.includes('@types/kafka')) patterns.libraries.add('message-queue');
            if (allContent.includes('bull') || allContent.includes('@types/bull')) patterns.libraries.add('message-queue');
        }

        return patterns;
    }

    private calculateClusterCentrality(cluster: ComponentCluster): number {
        // Simple centrality calculation based on dependency connections
        const internalDeps = cluster.dependencies.filter(dep => cluster.files.includes(dep)).length;
        const externalDeps = cluster.dependencies.length - internalDeps;

        // Higher centrality for clusters with many external connections
        return cluster.files.length > 0 ? externalDeps / cluster.files.length : 0;
    }

    private determineComponentType(signals: any, metadata: any): ArchitectureComponent['type'] {
        // Use architectural purpose from clustering if available (most reliable)
        if (metadata?.architecturalPurpose) {
            const purposeToType: Record<string, ArchitectureComponent['type']> = {
                'api': 'api',
                'ui': 'ui',
                'data': 'data',
                'business': 'business',
                'infra': 'infra',
                'config': 'config',
                'middleware': 'middleware',
                'entry': 'entry',
                'utility': 'util'
            };
            return purposeToType[metadata.architecturalPurpose] || 'util';
        }

        // Fallback to pattern-based classification if no architectural purpose determined
        const { filePatterns, namingPatterns, dependencyPatterns, structuralPatterns, contentPatterns, centralityScore } = signals;

        // Entry points (main application files)
        if (namingPatterns.hasMainFiles || this.isRootLevel(structuralPatterns) ||
            (metadata?.language === 'javascript' && structuralPatterns.commonPrefix === '/')) {
            return 'entry';
        }

        // API/Routing layer (enhanced detection)
        if (namingPatterns.hasApiFiles ||
            contentPatterns.frameworks?.has('express') ||
            contentPatterns.frameworks?.has('fastify') ||
            contentPatterns.frameworks?.has('nestjs') ||
            (dependencyPatterns.avgImports > 3 && this.hasHttpPatterns(contentPatterns))) {
            return 'api';
        }

        // Data layer (enhanced detection)
        if (namingPatterns.hasDataFiles ||
            contentPatterns.libraries?.has('orm') ||
            contentPatterns.libraries?.has('database') ||
            (filePatterns.hasDatabase && dependencyPatterns.internalDeps > dependencyPatterns.externalDeps)) {
            return 'data';
        }

        // UI Components (React, Vue, Angular, Svelte)
        if (contentPatterns.frameworks?.has('react') ||
            contentPatterns.frameworks?.has('vue') ||
            contentPatterns.frameworks?.has('angular') ||
            contentPatterns.frameworks?.has('svelte') ||
            namingPatterns.hasUiFiles ||
            filePatterns.hasReact ||
            metadata?.language === 'tsx' ||
            metadata?.language === 'jsx') {
            return 'ui';
        }

        // Business logic (functions with complex logic)
        if (namingPatterns.hasBusinessFiles ||
            (dependencyPatterns.internalDeps > dependencyPatterns.externalDeps * 2 &&
                dependencyPatterns.avgImports > 2)) {
            return 'business';
        }

        // Infrastructure (external services, clients)
        if (contentPatterns.libraries?.has('http-client') ||
            centralityScore > 1.5 ||
            namingPatterns.hasApiFiles ||
            (dependencyPatterns.externalDeps > dependencyPatterns.internalDeps * 1.5)) {
            return 'infra';
        }

        // Authentication/Authorization
        if (contentPatterns.libraries?.has('auth') ||
            filePatterns.hasAuth ||
            namingPatterns.hasApiFiles) { // Auth often goes with API routes
            return 'auth';
        }

        // Configuration
        if (namingPatterns.hasConfigFiles ||
            contentPatterns.libraries?.has('config') ||
            filePatterns.hasConfig) {
            return 'config';
        }

        // Testing
        if (namingPatterns.hasTestFiles) {
            return 'test';
        }

        // Middleware (interceptors, decorators, shared utilities)
        if (namingPatterns.hasUtilFiles ||
            dependencyPatterns.dependencyDiversity > 8 ||
            (filePatterns.hasExports && filePatterns.importPatterns.length > 6)) {
            return 'middleware';
        }

        // Generic utilities (final fallback)
        return 'util';
    }

    private hasHttpPatterns(contentPatterns: any): boolean {
        return contentPatterns.libraries?.has('http-client') ||
            contentPatterns.frameworks?.has('express') ||
            contentPatterns.frameworks?.has('fastify') ||
            contentPatterns.frameworks?.has('nestjs');
    }

    private isRootLevel(structural: any): boolean {
        return structural.commonPrefix === '' || structural.commonPrefix === '/' || structural.directoryDepth <= 1;
    }

    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    private groupFilesByDirectory(dependencies: DependencyInfo[]): Map<string, DependencyInfo[]> {
        const groups = new Map<string, DependencyInfo[]>();

        for (const dep of dependencies) {
            const dir = dep.filePath.split('/').slice(0, -1).join('/') || '/';
            if (!groups.has(dir)) {
                groups.set(dir, []);
            }
            groups.get(dir)!.push(dep);
        }

        return groups;
    }

    private classifyComponentType(dir: string, files: DependencyInfo[]): ArchitectureComponent['type'] {
        const lowerDir = dir.toLowerCase();
        const fileNames = files.map(f => f.filePath.toLowerCase());
        const dirParts = dir.toLowerCase().split('/').filter(p => p);

        // Extract patterns from files
        const filePatterns = this.analyzeFilePatterns(files);

        // Entry points - main application files
        if (this.isEntryPoint(dir, fileNames, filePatterns)) {
            return 'entry';
        }

        // API/Routing layer
        if (this.isApiLayer(dir, fileNames, filePatterns)) {
            return 'api';
        }

        // Business logic / Domain layer
        if (this.isBusinessLogic(dir, fileNames, filePatterns)) {
            return 'business';
        }

        // Data access / Repository layer
        if (this.isDataLayer(dir, fileNames, filePatterns)) {
            return 'data';
        }

        // User interface / Presentation layer
        if (this.isUiLayer(dir, fileNames, filePatterns)) {
            return 'ui';
        }

        // Infrastructure / External services
        if (this.isInfrastructure(dir, fileNames, filePatterns)) {
            return 'infra';
        }

        // Configuration
        if (this.isConfiguration(dir, fileNames, filePatterns)) {
            return 'config';
        }

        // Authentication/Authorization
        if (this.isAuthLayer(files, filePatterns)) {
            return 'auth';
        }

        // Testing
        if (this.isTesting(dir, fileNames)) {
            return 'test';
        }

        // Middleware/Shared utilities
        if (this.isMiddleware(dir, fileNames, filePatterns)) {
            return 'middleware';
        }

        // Determine based on project structure patterns
        return this.classifyByProjectStructure(dirParts, filePatterns);
    }

    private analyzeFilePatterns(files: DependencyInfo[]): {
        hasExports: boolean;
        hasImports: boolean;
        hasReact: boolean;
        hasDatabase: boolean;
        hasHttp: boolean;
        hasAuth: boolean;
        hasConfig: boolean;
        hasTest: boolean;
        hasUtil: boolean;
        fileExtensions: Set<string>;
        importPatterns: string[];
        exportPatterns: string[];
    } {
        const patterns = {
            hasExports: false,
            hasImports: false,
            hasReact: false,
            hasDatabase: false,
            hasHttp: false,
            hasAuth: false,
            hasConfig: false,
            hasTest: false,
            hasUtil: false,
            fileExtensions: new Set<string>(),
            importPatterns: [] as string[],
            exportPatterns: [] as string[]
        };

        for (const file of files) {
            // File extensions
            const ext = file.filePath.split('.').pop()?.toLowerCase();
            if (ext) patterns.fileExtensions.add(ext);

            // Import patterns
            patterns.hasImports = patterns.hasImports || file.imports.length > 0;
            patterns.importPatterns.push(...file.imports);

            // Export patterns
            patterns.hasExports = patterns.hasExports || file.exports.length > 0;
            patterns.exportPatterns.push(...file.exports);

            // Library detection
            const allContent = [...file.imports, ...file.exports].join(' ').toLowerCase();
            patterns.hasReact = patterns.hasReact || allContent.includes('react') || allContent.includes('jsx');
            patterns.hasDatabase = patterns.hasDatabase || allContent.includes('mongoose') || allContent.includes('sequelize') ||
                allContent.includes('prisma') || allContent.includes('typeorm');
            patterns.hasHttp = patterns.hasHttp || allContent.includes('express') || allContent.includes('fastify') ||
                allContent.includes('axios') || allContent.includes('fetch');
            patterns.hasAuth = patterns.hasAuth || allContent.includes('passport') || allContent.includes('jwt') ||
                allContent.includes('bcrypt') || allContent.includes('auth');
            patterns.hasConfig = patterns.hasConfig || allContent.includes('dotenv') || allContent.includes('config');
        }

        return patterns;
    }

    private isEntryPoint(dir: string, fileNames: string[], patterns: any): boolean {
        const lowerDir = dir.toLowerCase();

        // Main application files
        if (fileNames.some(f => f.includes('main.') || f.includes('app.') || f.includes('index.') ||
            f.includes('server.') || f.includes('start.'))) {
            return true;
        }

        // Root level or src root
        if (lowerDir === '/' || lowerDir === '/src' || lowerDir === '/app' || lowerDir === '/lib') {
            return patterns.hasExports && patterns.importPatterns.length > 0;
        }

        return false;
    }

    private isApiLayer(dir: string, fileNames: string[], patterns: any): boolean {
        const lowerDir = dir.toLowerCase();

        // API related directories
        if (lowerDir.includes('/api') || lowerDir.includes('/routes') || lowerDir.includes('/controllers') ||
            lowerDir.includes('/endpoints') || lowerDir.includes('/handlers')) {
            return true;
        }

        // HTTP-related files
        if (patterns.hasHttp && fileNames.some(f => f.includes('route') || f.includes('controller') ||
            f.includes('handler') || f.includes('endpoint'))) {
            return true;
        }

        return false;
    }

    private isBusinessLogic(dir: string, fileNames: string[], patterns: any): boolean {
        const lowerDir = dir.toLowerCase();

        // Business logic directories
        if (lowerDir.includes('/service') || lowerDir.includes('/logic') || lowerDir.includes('/business') ||
            lowerDir.includes('/domain') || lowerDir.includes('/core') || lowerDir.includes('/usecase') ||
            lowerDir.includes('/usecases')) {
            return true;
        }

        // Business logic patterns
        if (fileNames.some(f => f.includes('service') || f.includes('manager') || f.includes('processor') ||
            f.includes('handler') || f.includes('workflow'))) {
            return true;
        }

        return false;
    }

    private isDataLayer(dir: string, fileNames: string[], patterns: any): boolean {
        const lowerDir = dir.toLowerCase();

        // Data layer directories
        if (lowerDir.includes('/model') || lowerDir.includes('/entity') || lowerDir.includes('/schema') ||
            lowerDir.includes('/dao') || lowerDir.includes('/repository') || lowerDir.includes('/repositories')) {
            return true;
        }

        // Database-related patterns
        if (patterns.hasDatabase || fileNames.some(f => f.includes('model') || f.includes('entity') ||
            f.includes('schema') || f.includes('repository'))) {
            return true;
        }

        return false;
    }

    private isUiLayer(dir: string, fileNames: string[], patterns: any): boolean {
        const lowerDir = dir.toLowerCase();

        // UI directories
        if (lowerDir.includes('/component') || lowerDir.includes('/components') || lowerDir.includes('/view') ||
            lowerDir.includes('/views') || lowerDir.includes('/ui') || lowerDir.includes('/page') ||
            lowerDir.includes('/pages') || lowerDir.includes('/screen') || lowerDir.includes('/template')) {
            return true;
        }

        // React/Vue/Angular patterns
        if (patterns.hasReact || fileNames.some(f => f.includes('component') || f.includes('view') ||
            f.includes('page') || f.includes('screen'))) {
            return true;
        }

        return false;
    }

    private isInfrastructure(dir: string, fileNames: string[], patterns: any): boolean {
        const lowerDir = dir.toLowerCase();

        // Infrastructure directories
        if (lowerDir.includes('/infra') || lowerDir.includes('/infrastructure') || lowerDir.includes('/external') ||
            lowerDir.includes('/provider') || lowerDir.includes('/client') || lowerDir.includes('/adapter')) {
            return true;
        }

        // External service patterns
        if (fileNames.some(f => f.includes('client') || f.includes('provider') || f.includes('adapter') ||
            f.includes('connector') || f.includes('integration'))) {
            return true;
        }

        return false;
    }

    private isConfiguration(dir: string, fileNames: string[], patterns: any): boolean {
        const lowerDir = dir.toLowerCase();

        // Config directories
        if (lowerDir.includes('/config') || lowerDir.includes('/settings') || lowerDir.includes('/env')) {
            return true;
        }

        // Config patterns
        if (patterns.hasConfig || fileNames.some(f => f.includes('config') || f.includes('settings') ||
            f.includes('env') || f.includes('constants'))) {
            return true;
        }

        return false;
    }

    private isAuthLayer(files: DependencyInfo[], patterns: any): boolean {
        // Check for authentication libraries
        if (patterns.libraries?.has('auth')) {
            return true;
        }

        // Check file content and naming patterns
        return files.some(f => {
            const content = [...f.imports, ...f.exports].join(' ').toLowerCase();
            const fileName = f.filePath.toLowerCase();
            const dir = fileName.split('/').slice(0, -1).join('/').toLowerCase();

            // Auth directories
            if (dir.includes('/auth') || dir.includes('/security') || dir.includes('/permission')) {
                return true;
            }

            // Auth content and naming
            return content.includes('auth') || content.includes('login') ||
                content.includes('security') || content.includes('permission') ||
                content.includes('jwt') || content.includes('oauth') ||
                content.includes('passport') || content.includes('session') ||
                fileName.includes('auth') || fileName.includes('login') ||
                fileName.includes('security') || fileName.includes('permission') ||
                fileName.includes('authenticate') || fileName.includes('authorize');
        });
    }

    private isTesting(dir: string, fileNames: string[]): boolean {
        const lowerDir = dir.toLowerCase();

        // Test directories
        if (lowerDir.includes('/test') || lowerDir.includes('/tests') || lowerDir.includes('/spec') ||
            lowerDir.includes('/specs') || lowerDir.includes('__tests__')) {
            return true;
        }

        // Test files
        if (fileNames.some(f => f.includes('test') || f.includes('spec') || f.includes('.test.') ||
            f.includes('.spec.'))) {
            return true;
        }

        return false;
    }

    private isMiddleware(dir: string, fileNames: string[], patterns: any): boolean {
        const lowerDir = dir.toLowerCase();

        // Middleware directories
        if (lowerDir.includes('/middleware') || lowerDir.includes('/interceptor') || lowerDir.includes('/hook') ||
            lowerDir.includes('/plugin')) {
            return true;
        }

        // Utility patterns (but not too generic)
        if (fileNames.some(f => f.includes('middleware') || f.includes('interceptor') || f.includes('hook') ||
            f.includes('plugin') || f.includes('decorator'))) {
            return true;
        }

        // Shared utilities with heavy imports/exports
        if (patterns.hasExports && patterns.hasImports && patterns.importPatterns.length > 5) {
            return true;
        }

        return false;
    }

    private classifyByProjectStructure(dirParts: string[], patterns: any): ArchitectureComponent['type'] {
        // Analyze directory structure for common patterns

        // Frontend patterns
        if (dirParts.includes('src') || dirParts.includes('app')) {
            if (dirParts.includes('components') || dirParts.includes('ui')) return 'ui';
            if (dirParts.includes('services') || dirParts.includes('api')) return 'api';
            if (dirParts.includes('utils') || dirParts.includes('helpers')) return 'middleware';
        }

        // Backend patterns
        if (dirParts.includes('lib') || dirParts.includes('src')) {
            if (dirParts.includes('controllers') || dirParts.includes('routes')) return 'api';
            if (dirParts.includes('services') || dirParts.includes('managers')) return 'business';
            if (dirParts.includes('models') || dirParts.includes('entities')) return 'data';
        }

        // Common utility directories
        if (dirParts.some(p => ['utils', 'helpers', 'common', 'shared', 'lib'].includes(p))) {
            return 'middleware';
        }

        // Default fallback - analyze based on file patterns
        if (patterns.hasExports && !patterns.hasReact && patterns.fileExtensions.has('js')) {
            return 'business'; // Likely backend logic
        }

        if (patterns.hasReact || patterns.fileExtensions.has('jsx') || patterns.fileExtensions.has('tsx')) {
            return 'ui'; // Likely frontend components
        }

        return 'util'; // Generic utilities as final fallback
    }

    private generateComponentName(type: ArchitectureComponent['type'], dir: string): string {
        const dirName = dir.split('/').pop() || 'root';
        const typeLabels = {
            entry: 'Entry Points',
            api: 'API Layer',
            business: 'Business Logic',
            data: 'Data Layer',
            ui: 'User Interface',
            infra: 'Infrastructure',
            auth: 'Authentication',
            config: 'Configuration',
            middleware: 'Middleware',
            util: 'Utilities',
            test: 'Tests'
        };

        return `${typeLabels[type]} (${dirName})`;
    }

    private getComponentDependencies(componentFiles: DependencyInfo[], allDeps: DependencyInfo[]): string[] {
        // For graph-based clustering, dependencies are already calculated at cluster level
        // This method is kept for backward compatibility but now returns cluster-level dependencies
        const dependencies = new Set<string>();

        for (const file of componentFiles) {
            for (const imp of file.dependencies) {
                // Resolve import to actual file path
                const targetFile = this.resolveImportToFile(imp, file.filePath, new Map(allDeps.map(d => [d.filePath, d])));
                if (targetFile) {
                    dependencies.add(targetFile);
                }
            }
        }

        return Array.from(dependencies);
    }

    private buildRelationships(components: ArchitectureComponent[], dependencies: DependencyInfo[]) {
        const relationships: Array<{ from: string, to: string, type: string, strength: number }> = [];

        // Create a mapping of file paths to their containing components for fast lookup
        const fileToComponentMap = new Map<string, ArchitectureComponent>();
        for (const component of components) {
            for (const filePath of component.files) {
                fileToComponentMap.set(filePath, component);
            }
        }

        // Track relationships to avoid duplicates
        const relationshipMap = new Map<string, { from: string, to: string, type: string, strength: number }>();

        // For each component, analyze its file dependencies
        for (const component of components) {
            const dependencyCounts = new Map<string, number>();

            // Count dependencies from each file in this component to files in other components
            for (const filePath of component.files) {
                const fileInfo = dependencies.find(d => d.filePath === filePath);
                if (!fileInfo) continue;

                for (const importPath of fileInfo.imports) {
                    // Resolve the import to an actual file path
                    const resolvedFile = this.resolveImportToFile(importPath, filePath, new Map(dependencies.map(d => [d.filePath, d])));
                    if (!resolvedFile) continue;

                    // Find which component contains this resolved file
                    const targetComponent = fileToComponentMap.get(resolvedFile);
                    if (targetComponent && targetComponent.id !== component.id) {
                        // This is a cross-component dependency
                        const key = `${component.id}->${targetComponent.id}`;
                        dependencyCounts.set(key, (dependencyCounts.get(key) || 0) + 1);
                    }
                }
            }

            // Create relationships based on dependency counts
            for (const [key, count] of dependencyCounts) {
                const [fromId, toId] = key.split('->');
                const relationshipKey = `${fromId}-${toId}`;

                if (!relationshipMap.has(relationshipKey)) {
                    relationshipMap.set(relationshipKey, {
                        from: fromId,
                        to: toId,
                        type: 'depends_on',
                        strength: count
                    });
                } else {
                    // Update strength if this relationship already exists
                    relationshipMap.get(relationshipKey)!.strength += count;
                }
            }
        }

        // Convert map to array and sort by strength (strongest first)
        return Array.from(relationshipMap.values()).sort((a, b) => b.strength - a.strength);
    }

    private extractPackagesFromManifests(manifestFiles: Array<{ path: string, content: string }>): Set<string> {
        const packages = new Set<string>();

        for (const file of manifestFiles) {
            const lower = file.path.toLowerCase();

            try {
                if (lower.endsWith('package.json')) {
                    const parsed = JSON.parse(file.content);
                    const allDeps = {
                        ...(parsed.dependencies || {}),
                        ...(parsed.devDependencies || {}),
                        ...(parsed.optionalDependencies || {}),
                        ...(parsed.peerDependencies || {})
                    };
                    Object.keys(allDeps).forEach(pkg => packages.add(pkg));
                } else if (lower.endsWith('requirements.txt')) {
                    file.content.split(/\r?\n/).forEach(line => {
                        const match = line.trim().match(/^([a-zA-Z0-9._-]+)/);
                        if (match) packages.add(match[1]);
                    });
                } else if (lower.endsWith('pipfile')) {
                    file.content.split(/\r?\n/).forEach(line => {
                        const match = line.match(/^\s*([a-zA-Z0-9._-]+)\s*=/);
                        if (match) packages.add(match[1]);
                    });
                } else if (lower.endsWith('pyproject.toml')) {
                    file.content.split(/\r?\n/).forEach(line => {
                        const match = line.match(/^\s*"?([a-zA-Z0-9._-]+)"?\s*=/);
                        if (match) packages.add(match[1]);
                    });
                } else if (lower.endsWith('go.mod')) {
                    let inRequireBlock = false;
                    file.content.split(/\r?\n/).forEach(line => {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('require (')) {
                            inRequireBlock = true;
                            return;
                        }
                        if (inRequireBlock && trimmed.startsWith(')')) {
                            inRequireBlock = false;
                            return;
                        }
                        if (trimmed.startsWith('require ')) {
                            const parts = trimmed.replace('require', '').trim().split(/\s+/);
                            if (parts[0]) packages.add(parts[0]);
                        } else if (inRequireBlock && trimmed) {
                            const parts = trimmed.split(/\s+/);
                            if (parts[0]) packages.add(parts[0]);
                        }
                    });
                } else if (lower.endsWith('cargo.toml')) {
                    let inDeps = false;
                    file.content.split(/\r?\n/).forEach(line => {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('[dependencies')) {
                            inDeps = true;
                            return;
                        }
                        if (trimmed.startsWith('[') && !trimmed.startsWith('[dependencies')) {
                            inDeps = false;
                        }
                        if (inDeps) {
                            const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*=|^([a-zA-Z0-9_.-]+)\s*$/);
                            const name = match?.[1] || match?.[2];
                            if (name) packages.add(name);
                        }
                    });
                } else if (lower.endsWith('pom.xml')) {
                    const groupIds = Array.from(file.content.matchAll(/<groupId>([^<]+)<\/groupId>/g)).map(m => m[1]);
                    const artifactIds = Array.from(file.content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)).map(m => m[1]);
                    groupIds.forEach(g => packages.add(g));
                    artifactIds.forEach(a => packages.add(a));
                } else if (lower.endsWith('build.gradle') || lower.endsWith('build.gradle.kts')) {
                    const regex = /['"]([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+):/g;
                    let match;
                    while ((match = regex.exec(file.content)) !== null) {
                        const [group, artifact] = match[1].split(':');
                        if (group) packages.add(group);
                        if (artifact) packages.add(artifact);
                    }
                } else if (lower.endsWith('composer.json')) {
                    const parsed = JSON.parse(file.content);
                    const allDeps = { ...(parsed.require || {}), ...(parsed['require-dev'] || {}) };
                    Object.keys(allDeps).forEach(pkg => packages.add(pkg));
                } else if (lower.endsWith('gemfile') || lower.endsWith('gemfile.lock')) {
                    const gemRegex = /gem\s+['"]([^'"]+)['"]/g;
                    let match;
                    while ((match = gemRegex.exec(file.content)) !== null) {
                        packages.add(match[1]);
                    }
                } else if (lower.endsWith('.csproj')) {
                    const includeMatches = Array.from(file.content.matchAll(/<PackageReference[^>]*Include="([^"]+)"/g)).map(m => m[1]);
                    includeMatches.forEach(m => packages.add(m));
                } else if (lower.endsWith('package.swift')) {
                    const urlMatches = Array.from(file.content.matchAll(/package\(url:\s*["']([^"']+)["']/g)).map(m => m[1]);
                    urlMatches.forEach(u => packages.add(u));
                }
            } catch (error) {
                console.warn(`Unable to parse manifest ${file.path}:`, error);
            }
        }

        return packages;
    }

    private async loadExternalRegistry(supabase: SupabaseClient): Promise<ExternalTarget[]> {
        try {
            let data: any[] | null = null;
            let rawCount = 0;

            // Prefer service role to bypass RLS; fall back to provided client if it fails
            try {
                const adminClient = createServiceRoleClient();
                const { data: adminData, error: adminError } = await adminClient
                    .from('system_nodes')
                    .select('*');
                if (adminError) {
                    throw adminError;
                }
                data = adminData || [];
            } catch (adminErr) {
                console.warn('[SID] service role query failed, falling back to provided client:', adminErr);
            }

            if (!data) {
                const { data: anonData, error: anonError } = await supabase
                    .from('system_nodes')
                    .select('*');
                if (anonError) throw anonError;
                data = anonData || [];
            }

            rawCount = Array.isArray(data) ? data.length : 0;
            const nodes = (data as any[]).map(row => {
                const packageNames = Array.isArray((row as any).package_names) ? (row as any).package_names : [];
                const packagePrefixes = Array.isArray((row as any).package_prefixes) ? (row as any).package_prefixes : [];
                const protocolSchemes = Array.isArray((row as any).protocol_schemes) ? (row as any).protocol_schemes : [];
                const serviceHostPatterns = Array.isArray((row as any).service_host_patterns) ? (row as any).service_host_patterns : [];
                const surfacesRaw = (row as any).surfaces;
                let surfaces: any[] = [];
                if (Array.isArray(surfacesRaw)) {
                    surfaces = surfacesRaw;
                } else if (typeof surfacesRaw === 'string') {
                    try {
                        const parsed = JSON.parse(surfacesRaw);
                        if (Array.isArray(parsed)) surfaces = parsed;
                    } catch {
                        surfaces = [];
                    }
                }
                return {
                    id: (row as any).id,
                    label: (row as any).label,
                    category: (row as any).category,
                    packageNames,
                    packagePrefixes,
                    protocolSchemes,
                    serviceHostPatterns,
                    surfaces,
                    provider: (row as any).provider ?? null,
                    needsReview: Boolean((row as any).needs_review),
                    enabled: (row as any).enabled
                };
            }).filter(target => !!target.id && !!target.label && rowEnabled(target));

            return nodes;
        } catch (err) {
            console.warn('Failed to load system_nodes:', err);
            return [];
        }
    }

    private findVendorForImport(importPath: string, externalTargets: ExternalTarget[]): ExternalTarget | null {
        // Skip relative/imports resolved locally
        if (importPath.startsWith('.') || importPath.startsWith('/')) return null;

        const normalizedImport = importPath.toLowerCase();

        for (const target of externalTargets) {
            const names = target.packageNames?.map(n => n.toLowerCase()) || [];
            const prefixes = target.packagePrefixes?.map(p => p.toLowerCase()) || [];

            const nameMatch = names.some(name =>
                normalizedImport === name || normalizedImport.startsWith(`${name}/`)
            );
            const prefixMatch = prefixes.some(prefix =>
                normalizedImport.startsWith(prefix)
            );

            if (nameMatch || prefixMatch) {
                return target;
            }
        }

        return null;
    }

    private buildExternalRelationships(
        components: ArchitectureComponent[],
        dependencies: DependencyInfo[],
        externalTargets: ExternalTarget[],
        unknownTargets: ExternalTarget[]
    ): ExternalRelationship[] {
        const targets = [...externalTargets, ...unknownTargets];
        if (targets.length === 0) return [];

        const depMap = new Map(dependencies.map(d => [d.filePath, d]));
        const edges = new Map<string, ExternalRelationship>();

        for (const component of components) {
            for (const filePath of component.files) {
                const info = depMap.get(filePath);
                if (!info) continue;

                for (const imp of info.imports) {
                    const vendor = this.findVendorForImport(imp, targets);
                    if (!vendor) continue;

                    const key = `${component.id}->${vendor.id}`;
                    const current = edges.get(key) || { from: component.id, to: vendor.id, strength: 0 };
                    current.strength += 1;
                    edges.set(key, current);
                }
            }
        }

        return Array.from(edges.values()).sort((a, b) => b.strength - a.strength);
    }

    private buildHighLevelGraph(
        components: ArchitectureComponent[],
        relationships: Array<{ from: string, to: string, type: string, strength: number }>,
        externalTargets: ExternalTarget[],
        externalRelationships: ExternalRelationship[]
    ): { nodes: HighLevelNode[], edges: HighLevelEdge[], componentToGroup: Map<string, string>, targetToGroup: Map<string, string> } {
        const internalGroups = this.groupInternalComponents(components);
        const externalGroups = this.groupExternalTargets(externalTargets);
        const edgeMap = new Map<string, HighLevelEdge>();

        const addEdge = (from: string, to: string, strength: number, kind: 'internal' | 'external') => {
            if (!from || !to || from === to) return;
            const key = `${from}->${to}`;
            const existing = edgeMap.get(key);
            if (existing) {
                existing.strength += strength;
            } else {
                edgeMap.set(key, { from, to, strength, kind });
            }
        };

        for (const rel of relationships) {
            const fromGroup = internalGroups.componentToGroup.get(rel.from);
            const toGroup = internalGroups.componentToGroup.get(rel.to);
            if (fromGroup && toGroup && fromGroup !== toGroup) {
                addEdge(fromGroup, toGroup, rel.strength, 'internal');
            }
        }

        for (const rel of externalRelationships) {
            const fromGroup = internalGroups.componentToGroup.get(rel.from);
            const toGroup = externalGroups.targetToGroup.get(rel.to);
            if (fromGroup && toGroup) {
                addEdge(fromGroup, toGroup, rel.strength, 'external');
            }
        }

        return {
            nodes: [...internalGroups.nodes, ...externalGroups.nodes],
            edges: Array.from(edgeMap.values()),
            componentToGroup: internalGroups.componentToGroup,
            targetToGroup: externalGroups.targetToGroup
        };
    }

    private isUIFile(filePath: string): boolean {
        const lower = filePath.toLowerCase();
        const isReact = lower.endsWith('.tsx') || lower.endsWith('.jsx');
        return isReact && (lower.includes('/app/') || lower.includes('/components/') || lower.includes('/pages/'));
    }

    private matchToolFromImport(importPath: string, targets: ExternalTarget[]): ExternalTarget | null {
        if (!importPath || importPath.startsWith('.') || importPath.startsWith('/')) return null;
        const lower = importPath.toLowerCase();

        for (const tool of targets) {
            const names = (tool.packageNames || []).map(n => n.toLowerCase());
            const prefixes = (tool.packagePrefixes || []).map(p => p.toLowerCase());

            const nameMatch = names.some(name => lower === name || lower.startsWith(`${name}/`));
            const prefixMatch = prefixes.some(prefix => lower.startsWith(prefix));

            if (nameMatch || prefixMatch) {
                return tool;
            }
        }
        return null;
    }

    private buildToolGraph(
        dependencies: DependencyInfo[],
        targets: ExternalTarget[]
    ): { nodes: HighLevelNode[], edges: HighLevelEdge[], fullNodes: HighLevelNode[], fullEdges: HighLevelEdge[], groupMappings: { componentToGroup: Record<string, string>, vendorToGroup: Record<string, string> } } {
        const targetMap = new Map<string, ExternalTarget>();
        for (const t of targets) {
            if (t.id) targetMap.set(t.id, t);
        }

        const fileMap = new Map<string, DependencyInfo>(dependencies.map(d => [d.filePath, d]));
        const fileToolMap = new Map<string, Set<string>>();
        const localImports = new Map<string, string[]>();

        for (const dep of dependencies) {
            const tools = new Set<string>();
            for (const imp of dep.imports) {
                const tool = this.matchToolFromImport(imp, targets);
                if (tool) {
                    tools.add(tool.id);
                } else {
                    const resolved = this.resolveImportToFile(imp, dep.filePath, fileMap);
                    if (resolved) {
                        if (!localImports.has(dep.filePath)) localImports.set(dep.filePath, []);
                        localImports.get(dep.filePath)!.push(resolved);
                    }
                }
            }
            fileToolMap.set(dep.filePath, tools);
            if (!localImports.has(dep.filePath)) localImports.set(dep.filePath, []);
        }

        // Propagate tool tags through relative imports so wrapper files still carry the tool identity
        let changed = true;
        while (changed) {
            changed = false;
            for (const [filePath, imports] of localImports.entries()) {
                const fileTools = fileToolMap.get(filePath) ?? new Set<string>();
                for (const targetFile of imports) {
                    const targetTools = fileToolMap.get(targetFile);
                    if (!targetTools || targetTools.size === 0) continue;
                    for (const toolId of targetTools) {
                        if (!fileTools.has(toolId)) {
                            fileTools.add(toolId);
                            changed = true;
                        }
                    }
                }
                fileToolMap.set(filePath, fileTools);
            }
        }

        const toolUsage = new Map<string, Set<string>>();
        const edges = new Map<string, HighLevelEdge>();
        const addEdge = (a: string, b: string) => {
            if (a === b) return;
            const [from, to] = a < b ? [a, b] : [b, a];
            const key = `${from}->${to}`;
            const existing = edges.get(key);
            if (existing) {
                existing.strength += 1;
            } else {
                edges.set(key, { from, to, strength: 1, kind: 'internal' });
            }
        };

        for (const [filePath, tools] of fileToolMap.entries()) {
            if (!tools || tools.size === 0) continue;
            for (const toolId of tools) {
                if (!toolUsage.has(toolId)) toolUsage.set(toolId, new Set());
                toolUsage.get(toolId)!.add(filePath);
            }

            const toolArray = Array.from(tools);
            for (let i = 0; i < toolArray.length; i++) {
                for (let j = i + 1; j < toolArray.length; j++) {
                    addEdge(toolArray[i], toolArray[j]);
                }
            }
        }

        const nodes: HighLevelNode[] = [];
        for (const [toolId, files] of toolUsage.entries()) {
            const def = targetMap.get(toolId);
            if (!def) continue;
            nodes.push({
                id: toolId,
                label: def.label,
                category: def.category,
                type: 'external',
                fileCount: files.size,
                files: Array.from(files).slice(0, 50),
                packages: (def.packageNames || []).slice(0, 20),
                role: def.category,
                source: 'code'
            });
        }

        const fullEdges = Array.from(edges.values());
        return {
            nodes,
            edges: fullEdges,
            fullNodes: nodes,
            fullEdges,
            groupMappings: { componentToGroup: {}, vendorToGroup: {} }
        };
    }

    private getEdgeKey(edge: HighLevelEdge): string {
        return `${edge.from}->${edge.to}`;
    }

    private groupInternalComponents(components: ArchitectureComponent[]): { nodes: HighLevelNode[], componentToGroup: Map<string, string> } {
        const groups = new Map<string, HighLevelNode>();
        const componentToGroup = new Map<string, string>();

        for (const component of components) {
            const type = component.type;
            const groupId = `core_${type}`;
            if (!groups.has(groupId)) {
                groups.set(groupId, {
                    id: groupId,
                    label: this.getComponentTypeLabel(type),
                    type: 'internal',
                    category: type,
                    componentIds: [],
                    fileCount: 0
                });
            }

            const group = groups.get(groupId)!;
            group.componentIds!.push(component.id);
            group.fileCount = (group.fileCount || 0) + component.files.length;
            componentToGroup.set(component.id, groupId);
        }

        for (const group of groups.values()) {
            const typeLabel = this.getComponentTypeLabel(group.category as ArchitectureComponent['type']);
            group.label = `${typeLabel} (${group.fileCount ?? 0} files)`;
        }

        return {
            nodes: Array.from(groups.values()),
            componentToGroup
        };
    }

    private groupExternalTargets(externalTargets: ExternalTarget[]): { nodes: HighLevelNode[], targetToGroup: Map<string, string> } {
        const groups = new Map<string, HighLevelNode>();
        const targetToGroup = new Map<string, string>();

        for (const target of externalTargets) {
            const category = target.category || 'other';
            const groupId = `ext_${category}`;

            if (!groups.has(groupId)) {
                groups.set(groupId, {
                    id: groupId,
                    label: '',
                    type: 'external',
                    category,
                    vendorIds: [],
                    vendorLabels: [],
                    needsReview: false
                });
            }

            const group = groups.get(groupId)!;
            group.vendorIds!.push(target.id);
            group.vendorLabels!.push(target.label);
            group.needsReview = group.needsReview || Boolean(target.needsReview);

            targetToGroup.set(target.id, groupId);
        }

        for (const group of groups.values()) {
            const categoryLabel = this.formatExternalCategory(group.category as ExternalCategory);
            const vendors = group.vendorLabels || [];
            const summary = vendors.slice(0, 3).join(', ');
            const remainder = vendors.length > 3 ? ` +${vendors.length - 3} more` : '';
            group.label = summary ? `${categoryLabel}\n${summary}${remainder}` : categoryLabel;
        }

        return {
            nodes: Array.from(groups.values()),
            targetToGroup
        };
    }

    private generateMermaidDiagram(nodes: HighLevelNode[], edges: HighLevelEdge[]): string {
        // Flowchart top-to-bottom with horizontal lanes to avoid ultra-wide rows
        let mermaid = 'flowchart TB\n';

        // Base styles
        mermaid += '    classDef lane fill:#111827,stroke:#1f2937,color:#e5e7eb,stroke-width:1px;\n';
        mermaid += '    classDef internal fill:#0f172a,stroke:#1d4ed8,color:#e2e8f0,stroke-width:1.5px,rx:4px,ry:4px;\n';
        mermaid += '    classDef external fill:#1f2937,stroke:#f59e0b,color:#ffedd5,stroke-width:1.5px,rx:4px,ry:4px;\n';
        mermaid += '    classDef unknown fill:#1f1f1f,stroke:#ef4444,color:#fecdd3,stroke-dasharray: 6 4;\n';

        // Category accents for faster scanning
        const categoryClass: Record<string, string> = {
            entry: 'cat-entry',
            api: 'cat-api',
            business: 'cat-business',
            data: 'cat-data',
            ui: 'cat-ui',
            infra: 'cat-infra',
            auth: 'cat-auth',
            config: 'cat-config',
            middleware: 'cat-middleware',
            util: 'cat-util',
            test: 'cat-test',
            db: 'cat-db',
            queue: 'cat-queue',
            search: 'cat-search',
            messaging: 'cat-messaging',
            observability: 'cat-observability',
            orchestration: 'cat-orchestration',
            storage: 'cat-storage',
            email: 'cat-email',
            payments: 'cat-payments',
            cdn: 'cat-cdn',
            ai: 'cat-ai',
            cloud: 'cat-cloud',
            other: 'cat-other',
            gateway: 'cat-gateway',
            analytics: 'cat-analytics',
            repo: 'cat-repo',
            scheduler: 'cat-scheduler',
            hosting: 'cat-hosting',
            payment: 'cat-payments'
        };

        mermaid += '    classDef cat-entry stroke:#22d3ee,color:#e0f2fe;\n';
        mermaid += '    classDef cat-api stroke:#38bdf8,color:#e0f2fe;\n';
        mermaid += '    classDef cat-business stroke:#a855f7,color:#f5f3ff;\n';
        mermaid += '    classDef cat-data stroke:#14b8a6,color:#ccfbf1;\n';
        mermaid += '    classDef cat-ui stroke:#c084fc,color:#faf5ff;\n';
        mermaid += '    classDef cat-infra stroke:#94a3b8,color:#e2e8f0;\n';
        mermaid += '    classDef cat-auth stroke:#f97316,color:#ffedd5;\n';
        mermaid += '    classDef cat-config stroke:#eab308,color:#fef9c3;\n';
        mermaid += '    classDef cat-middleware stroke:#22c55e,color:#dcfce7;\n';
        mermaid += '    classDef cat-util stroke:#3b82f6,color:#dbeafe;\n';
        mermaid += '    classDef cat-test stroke:#f472b6,color:#fce7f3;\n';
        mermaid += '    classDef cat-db stroke:#f59e0b,color:#fffbeb;\n';
        mermaid += '    classDef cat-queue stroke:#f97316,color:#ffedd5;\n';
        mermaid += '    classDef cat-search stroke:#8b5cf6,color:#ede9fe;\n';
        mermaid += '    classDef cat-messaging stroke:#06b6d4,color:#cffafe;\n';
        mermaid += '    classDef cat-observability stroke:#22d3ee,color:#e0f2fe;\n';
        mermaid += '    classDef cat-orchestration stroke:#38bdf8,color:#e0f2fe;\n';
        mermaid += '    classDef cat-storage stroke:#0ea5e9,color:#e0f2fe;\n';
        mermaid += '    classDef cat-email stroke:#f472b6,color:#fce7f3;\n';
        mermaid += '    classDef cat-payments stroke:#22c55e,color:#dcfce7;\n';
        mermaid += '    classDef cat-cdn stroke:#eab308,color:#fef9c3;\n';
        mermaid += '    classDef cat-ai stroke:#a855f7,color:#f5f3ff;\n';
        mermaid += '    classDef cat-cloud stroke:#94a3b8,color:#e2e8f0;\n';
        mermaid += '    classDef cat-other stroke:#6b7280,color:#e5e7eb;\n';
        mermaid += '    classDef cat-gateway stroke:#22d3ee,color:#e0f2fe;\n';
        mermaid += '    classDef cat-analytics stroke:#f472b6,color:#fce7f3;\n';
        mermaid += '    classDef cat-repo stroke:#3b82f6,color:#dbeafe;\n';
        mermaid += '    classDef cat-scheduler stroke:#38bdf8,color:#e0f2fe;\n';
        mermaid += '    classDef cat-hosting stroke:#c084fc,color:#faf5ff;\n';

        const internalNodes = nodes.filter(node => node.type === 'internal');
        const externalNodes = nodes.filter(node => node.type === 'external');
        const filteredEdges = this.filterHighLevelEdges(edges);

        const formatNodeLabel = (node: HighLevelNode) => {
            const parts = [node.label];
            if (node.fileCount !== undefined) {
                parts.push(`${node.fileCount} files`);
            }
            if (node.packages && node.packages.length > 0) {
                parts.push(node.packages.slice(0, 2).join(', ') + (node.packages.length > 2 ? ` +${node.packages.length - 2} more` : ''));
            }
            return this.escapeMermaidLabel(parts.join('\n'));
        };

        const classAssignments: Array<{ id: string; cls: string }> = [];

        if (internalNodes.length) {
            mermaid += '    subgraph Internal["Internal Systems"]\n';
            mermaid += '    direction LR\n';
            for (const node of internalNodes) {
                const label = formatNodeLabel(node);
                const cls = categoryClass[node.category || ''] || 'internal';
                mermaid += `        ${node.id}["${label}"]:::internal\n`;
                classAssignments.push({ id: node.id, cls });
            }
            mermaid += '    end\n';
        }

        if (externalNodes.length) {
            mermaid += '    subgraph External["External Services"]\n';
            mermaid += '    direction LR\n';
            for (const node of externalNodes) {
                const label = formatNodeLabel(node);
                const cls = node.needsReview ? 'unknown' : (categoryClass[node.category || ''] || 'external');
                mermaid += `        ${node.id}["${label}"]:::external\n`;
                classAssignments.push({ id: node.id, cls });
            }
            mermaid += '    end\n';
        }

        const linkStyles: string[] = [];
        filteredEdges.forEach((edge, index) => {
            const arrowStyle = edge.kind === 'external' ? '-.->' : '-->';
            mermaid += `    ${edge.from} ${arrowStyle} ${edge.to}\n`;

            const strokeWidth = Math.min(6, 1.5 + Math.log(edge.strength + 1));
            const dash = edge.kind === 'external' ? 'stroke-dasharray: 6 4,' : '';
            const strokeColor = edge.kind === 'external' ? '#f59e0b' : '#7dd3fc';
            linkStyles.push(`    linkStyle ${index} stroke:${strokeColor},stroke-width:${strokeWidth},${dash}opacity:0.9;`);
        });

        if (linkStyles.length) {
            mermaid += linkStyles.join('\n') + '\n';
        }

        if (classAssignments.length) {
            for (const assignment of classAssignments) {
                mermaid += `    class ${assignment.id} ${assignment.cls};\n`;
            }
        }

        return mermaid;
    }

    private filterHighLevelEdges(edges: HighLevelEdge[], limitPerSource = 6): HighLevelEdge[] {
        const grouped = new Map<string, HighLevelEdge[]>();
        for (const edge of edges) {
            if (!grouped.has(edge.from)) {
                grouped.set(edge.from, []);
            }
            grouped.get(edge.from)!.push(edge);
        }

        const result: HighLevelEdge[] = [];
        for (const list of grouped.values()) {
            list.sort((a, b) => b.strength - a.strength);
            result.push(...list.slice(0, limitPerSource));
        }

        return result;
    }

    private getComponentTypeLabel(type: ArchitectureComponent['type']): string {
        return COMPONENT_TYPE_LABELS[type] || 'Component';
    }

    private formatExternalCategory(category?: ExternalCategory | string): string {
        const key = (category as ExternalCategory) || 'other';
        return EXTERNAL_CATEGORY_LABELS[key] || EXTERNAL_CATEGORY_LABELS.other;
    }

    private escapeMermaidLabel(label: string): string {
        return label.replace(/"/g, '\'').replace(/\n/g, '<br/>');
    }

    private getComponentShape(type: ArchitectureComponent['type']): { open: string, close: string } {
        const shapes = {
            entry: { open: '([', close: '])' },        // Stadium shape
            api: { open: '[[', close: ']]' },          // Subroutine shape
            business: { open: '[', close: ']' },       // Rectangle
            data: { open: '((', close: '))' },         // Circle
            ui: { open: '{{', close: '}}' },           // Hexagon
            infra: { open: '[/', close: '/]' },        // Parallelogram alt
            auth: { open: '[?', close: '?]' },         // Diamond
            config: { open: '[(', close: ')]' },       // Trapezoid alt
            middleware: { open: '[', close: ']' },     // Rectangle
            util: { open: '[', close: ']' },           // Rectangle
            test: { open: '>', close: ']' }            // Asymmetric
        };

        return shapes[type] || { open: '[', close: ']' };
    }

    // Treat as external only if it looks like a package/module name (no relative paths or bare path aliases).
    private isLikelyExternalPackageName(pkg: string): boolean {
        if (!pkg) return false;
        const trimmed = pkg.trim();
        // Skip relative or absolute paths
        if (trimmed.startsWith('.') || trimmed.startsWith('/')) return false;
        // Allow scoped packages (@scope/name...) even though they contain '/'
        if (trimmed.startsWith('@')) return true;
        // Reject path-like strings (src/utils) but allow unscoped package ids (lodash, react, mongoose)
        if (trimmed.includes('/')) return false;
        return true;
    }
}
