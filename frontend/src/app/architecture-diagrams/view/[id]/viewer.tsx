'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, RefreshCw, Share2, ZoomIn, ZoomOut } from 'lucide-react';
import mermaid from 'mermaid';

// Global Mermaid initialization flag (Mermaid best practice - initialize only once)
let mermaidInitialized = false;

// Fallback diagram generator for when Mermaid fails
function generateFallbackDiagram(mermaidContent: string, analysisData?: any): string {
    const components = analysisData?.components || [];
    const relationships = analysisData?.relationships || [];

    // Parse basic component info from Mermaid content
    const componentLines = mermaidContent.split('\n').filter(line =>
        line.trim() && !line.includes('graph TD') && !line.includes('-->')
    );

    const width = Math.max(600, componentLines.length * 200);
    const height = Math.max(400, Math.ceil(componentLines.length / 3) * 150);

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
            </marker>
        </defs>
        <rect width="100%" height="100%" fill="#1e293b" />

        <!-- Header -->
        <text x="50%" y="30" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="18" font-weight="bold">
            Architecture Diagram (Fallback)
        </text>
        <text x="50%" y="50" text-anchor="middle" fill="#94a3b8" font-family="Arial" font-size="12">
            ${components.length} components, ${relationships.length} relationships
        </text>`;

    // Draw components
    componentLines.forEach((line, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const x = 150 + col * 200;
        const y = 100 + row * 120;

        // Extract component name from Mermaid syntax
        const nameMatch = line.match(/\[([^\]]+)\]/) || line.match(/\[\[([^\]]+)\]\]/) ||
                         line.match(/\(\(([^\)]+)\)\)/) || line.match(/\{\{([^\}]+)\}\}/) ||
                         line.match(/([^\[]+)\[/);

        const componentName = nameMatch ? nameMatch[1] : `Component ${index + 1}`;

        // Draw component box
        svg += `
        <rect x="${x - 80}" y="${y - 20}" width="160" height="40" fill="#3b82f6" stroke="#60a5fa" stroke-width="2" rx="5"/>
        <text x="${x}" y="${y + 5}" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="12" font-weight="bold">
            ${componentName.length > 15 ? componentName.substring(0, 12) + '...' : componentName}
        </text>`;
    });

    // Draw basic relationship lines (simplified)
    if (relationships.length > 0 && componentLines.length >= 2) {
        for (let i = 0; i < Math.min(relationships.length, 3); i++) {
            const startX = 150 + (i % 3) * 200;
            const startY = 100 + Math.floor(i / 3) * 120 + 20;
            const endX = 150 + ((i + 1) % 3) * 200;
            const endY = 100 + Math.floor((i + 1) / 3) * 120 - 20;

            svg += `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#94a3b8" stroke-width="2" marker-end="url(#arrowhead)"/>`;
        }
    }

    svg += `
        <!-- Footer message -->
        <text x="50%" y="${height - 30}" text-anchor="middle" fill="#64748b" font-family="Arial" font-size="11">
            This is a fallback diagram. Mermaid rendering failed - check debug info above.
        </text>
    </svg>`;

    return svg;
}

interface Diagram {
    id: string;
    title: string;
    content: string;
    diagram_type: string;
    analysis_data: any;
    created_at: string;
}

interface Repo {
    name: string;
    repo_url: string;
}

interface ArchitectureDiagramViewerProps {
    diagram: Diagram;
    repo: Repo;
}

export function ArchitectureDiagramViewer({ diagram, repo }: ArchitectureDiagramViewerProps) {
    const router = useRouter();
    const diagramRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [renderedSvg, setRenderedSvg] = useState<string>('');

    useEffect(() => {
        const renderDiagram = async () => {
            try {
                // Validate diagram content before attempting render
                if (!diagram.content || diagram.content.trim().length === 0) {
                    throw new Error('Diagram content is empty');
                }

                if (!diagram.content.includes('graph TD')) {
                    throw new Error('Diagram content does not appear to be valid Mermaid syntax (missing "graph TD")');
                }

                console.log('✅ Diagram content validation passed');

                // Initialize Mermaid BEFORE checking refs (Mermaid needs to be ready first)
                if (!mermaidInitialized) {
                    console.log('🔄 Initializing Mermaid...');
                    try {
                        mermaid.initialize({
                            startOnLoad: false,
                            theme: 'base', // Use base theme with custom variables (Mermaid v10 best practice)
                            themeVariables: {
                                background: '#1e293b',
                                primaryColor: '#3b82f6',
                                primaryTextColor: '#ffffff',
                                primaryBorderColor: '#60a5fa',
                                lineColor: '#94a3b8',
                                secondaryColor: '#64748b',
                                tertiaryColor: '#475569',
                                // Additional dark theme variables for better contrast
                                textColor: '#ffffff',
                                mainBkg: '#1e293b',
                                secondBkg: '#334155',
                                border1: '#475569',
                                border2: '#64748b'
                            },
                            flowchart: {
                                useMaxWidth: true,
                                htmlLabels: true,
                                curve: 'basis',
                                padding: 20
                            },
                            securityLevel: 'loose' // Allow more HTML features
                        });
                        mermaidInitialized = true;
                        console.log('✅ Mermaid initialized successfully');
                    } catch (initError) {
                        console.error('❌ Mermaid initialization failed:', initError);
                        throw new Error(`Mermaid initialization failed: ${initError instanceof Error ? initError.message : String(initError)}`);
                    }
                }

                // Wait for next tick to ensure DOM is ready (optional but safer)
                await new Promise(resolve => setTimeout(resolve, 0));

                console.log('🎨 Rendering diagram with content:', diagram.content.substring(0, 200) + '...');

                // Use a unique ID for each render to avoid conflicts (Mermaid requirement)
                const uniqueId = `mermaid-diagram-${diagram.id}-${Date.now()}`;

                console.log('🔧 About to call mermaid.render with ID:', uniqueId);

                try {
                    // Try Mermaid v10 API first
                    let result;
                    try {
                        result = await mermaid.render(uniqueId, diagram.content);
                        console.log('📊 Mermaid render result type:', typeof result);
                        console.log('🔍 Mermaid render result keys:', Object.keys(result || {}));
                    } catch (renderError) {
                        console.error('❌ Mermaid render failed:', renderError);
                        throw renderError;
                    }

                    // Handle different Mermaid API versions
                    let svgContent = '';
                    if (typeof result === 'string') {
                        svgContent = result;
                    } else if (result && typeof result === 'object') {
                        svgContent = result.svg || String(result);
                    } else {
                        throw new Error('Unexpected Mermaid render result format');
                    }

                    console.log('🎉 Extracted SVG content length:', svgContent.length);
                    console.log('👀 SVG content preview:', svgContent.substring(0, 200));

                    if (!svgContent || svgContent.length < 50) {
                        throw new Error('SVG content is empty or too short');
                    }

                    setRenderedSvg(svgContent);
                    setError(null);

                } catch (apiError) {
                    console.error('🚨 Mermaid API error:', apiError);

                    // Try fallback: generate HTML-based diagram from the Mermaid content
                    try {
                        console.log('🔄 Generating fallback HTML diagram...');
                        const fallbackSvg = generateFallbackDiagram(diagram.content, diagram.analysis_data);
                        setRenderedSvg(fallbackSvg);
                    } catch (fallbackError) {
                        console.error('❌ Fallback diagram generation failed:', fallbackError);
                        // Ultimate fallback: simple error message
                        const errorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
                            <rect width="100%" height="100%" fill="#1e293b" stroke="#ef4444" stroke-width="2"/>
                            <text x="50%" y="35%" text-anchor="middle" fill="#ef4444" font-family="Arial" font-size="16" font-weight="bold">
                                Render Error
                            </text>
                            <text x="50%" y="55%" text-anchor="middle" fill="#94a3b8" font-family="Arial" font-size="12">
                                Unable to generate diagram
                            </text>
                            <text x="50%" y="70%" text-anchor="middle" fill="#94a3b8" font-family="Arial" font-size="10">
                                Check debug info above
                            </text>
                        </svg>`;
                        setRenderedSvg(errorSvg);
                    }

                    setError(`Failed to render diagram: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
                }
                setLoading(false);
            } catch (err) {
                console.error('Failed to render Mermaid diagram:', err);
                console.error('Diagram content:', diagram.content);
                setError(`Failed to render diagram: ${err instanceof Error ? err.message : String(err)}`);
                setLoading(false);
            }
        };

        renderDiagram();
    }, [diagram.content, diagram.id]);

    const handleDownload = () => {
        if (renderedSvg) {
            // Download as SVG
            const element = document.createElement('a');
            const file = new Blob([renderedSvg], { type: 'image/svg+xml' });
            element.href = URL.createObjectURL(file);
            element.download = `${diagram.title.replace(/[^a-zA-Z0-9]/g, '_')}.svg`;
            element.click();
        } else {
            // Fallback to Mermaid source
            const element = document.createElement('a');
            const file = new Blob([diagram.content], { type: 'text/plain' });
            element.href = URL.createObjectURL(file);
            element.download = `${diagram.title.replace(/[^a-zA-Z0-9]/g, '_')}.mmd`;
            element.click();
        }
    };

    const regenerateDiagram = () => {
        // Navigate back to generator with the repo pre-selected
        router.push('/architecture-diagrams');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-white/70">Rendering architecture diagram...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-center max-w-2xl">
                    <div className="text-red-400 text-6xl mb-4">⚠️</div>
                    <h1 className="text-2xl font-bold text-white mb-2">Diagram Render Error</h1>
                    <p className="text-white/70 mb-6">{error}</p>

                    {/* Debug information */}
                    <details className="mb-6 text-left bg-slate-800/50 p-4 rounded-lg">
                        <summary className="text-white/80 cursor-pointer mb-2 font-medium">
                            🔧 Mermaid Source & Debug Info (click to expand)
                        </summary>
                        <div className="text-xs text-white/60 mb-3 space-y-1">
                            <div>Copy the content below to <a href="https://mermaid.live" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">mermaid.live</a> to test the syntax manually</div>
                            <div>Check browser console for detailed logs</div>
                            <div>Rendered SVG length: {renderedSvg?.length || 0} characters</div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <h5 className="text-white/90 font-medium mb-2">Mermaid Syntax:</h5>
                                <pre className="bg-slate-900 p-4 rounded text-sm text-white/80 overflow-x-auto max-h-64 whitespace-pre-wrap">
                                    <code>{diagram.content}</code>
                                </pre>
                            </div>
                            {renderedSvg && (
                                <div>
                                    <h5 className="text-white/90 font-medium mb-2">Generated SVG (first 500 chars):</h5>
                                    <pre className="bg-slate-900 p-4 rounded text-sm text-green-400 overflow-x-auto max-h-32 whitespace-pre-wrap">
                                        <code>{renderedSvg.substring(0, 500)}{renderedSvg.length > 500 ? '...' : ''}</code>
                                    </pre>
                                </div>
                            )}
                        </div>
                    </details>

                    <div className="space-x-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                        >
                            Try Again
                        </button>
                        <Link
                            href="/architecture-diagrams"
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                        >
                            Generate New
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <Link
                            href="/architecture-diagrams"
                            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Diagrams
                        </Link>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setZoom(Math.min(zoom + 0.2, 2))}
                                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                title="Zoom In"
                            >
                                <ZoomIn className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setZoom(Math.max(zoom - 0.2, 0.5))}
                                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                title="Zoom Out"
                            >
                                <ZoomOut className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleDownload}
                                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                title="Download Diagram"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                            <button
                                onClick={regenerateDiagram}
                                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                title="Regenerate"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-2">{diagram.title}</h1>
                            <div className="flex items-center gap-4 text-white/70">
                                <span className="flex items-center gap-2">
                                    Repository: {repo.name}
                                </span>
                                <span>•</span>
                                <span>
                                    Generated: {new Date(diagram.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Debug Info Panel */}
                <div className="mb-4 glass-panel p-4">
                    <h4 className="text-white font-medium mb-2">🔍 Debug Info:</h4>
                    <div className="text-sm text-white/80 space-y-1 grid grid-cols-2 gap-2">
                        <div>Diagram ID: <span className="text-blue-400">{diagram.id}</span></div>
                        <div>Content Length: <span className="text-green-400">{diagram.content?.length || 0}</span></div>
                        <div>SVG Length: <span className="text-yellow-400">{renderedSvg?.length || 0}</span></div>
                        <div>Loading: <span className={loading ? "text-red-400" : "text-green-400"}>{loading ? 'Yes' : 'No'}</span></div>
                        <div>Error: <span className={error ? "text-red-400" : "text-green-400"}>{error ? 'Yes' : 'No'}</span></div>
                        <div>Mermaid Initialized: <span className={mermaidInitialized ? "text-green-400" : "text-red-400"}>{mermaidInitialized ? 'Yes' : 'No'}</span></div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/20">
                        <button
                            onClick={() => {
                                console.log('🔄 Force re-render triggered');
                                setRenderedSvg('');
                                setError(null);
                                setLoading(true);
                                // Trigger useEffect re-run by changing dependencies
                                window.location.reload();
                            }}
                            className="px-3 py-1 text-sm bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded transition-colors"
                            title="Force Re-render"
                        >
                            🔄 Force Re-render
                        </button>
                    </div>
                </div>

                {/* Diagram */}
                <div className="glass-panel p-6">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-white">Architecture Overview</h2>
                        <div className="text-sm text-white/60">
                            {diagram.analysis_data?.components?.length || 0} components •
                            {diagram.analysis_data?.relationships?.length || 0} relationships
                        </div>
                    </div>

                    <div
                        className="overflow-auto bg-slate-800/50 rounded-lg p-4"
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                    >
                        <div
                            ref={diagramRef}
                            className="mermaid-container flex justify-center items-center"
                            style={{
                                minWidth: '800px',
                                minHeight: '600px',
                                backgroundColor: '#1e293b'
                            }}
                            dangerouslySetInnerHTML={{ __html: renderedSvg }}
                        />
                    </div>

                    {zoom !== 1 && (
                        <div className="mt-4 text-center">
                            <button
                                onClick={() => setZoom(1)}
                                className="text-sm text-blue-400 hover:text-blue-300"
                            >
                                Reset Zoom
                            </button>
                        </div>
                    )}
                </div>

                {/* Analysis Details */}
                {diagram.analysis_data && (
                    <div className="mt-6 glass-panel p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Analysis Details</h3>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="text-white font-medium mb-3">Components Found</h4>
                                <div className="space-y-2">
                                    {diagram.analysis_data.components?.map((component: any, index: number) => (
                                        <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded">
                                            <span className="text-white/80">{component.name}</span>
                                            <span className="text-white/60 text-sm">{component.files?.length || 0} files</span>
                                        </div>
                                    )) || <p className="text-white/60">No component data available</p>}
                                </div>
                            </div>

                            <div>
                                <h4 className="text-white font-medium mb-3">Architecture Insights</h4>
                                <div className="space-y-3 text-white/80">
                                    <div className="flex justify-between">
                                        <span>Total Files Analyzed:</span>
                                        <span>{diagram.analysis_data.components?.reduce((sum: number, c: any) => sum + (c.files?.length || 0), 0) || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Component Types:</span>
                                        <span>{new Set(diagram.analysis_data.components?.map((c: any) => c.type)).size || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Analysis Method:</span>
                                        <span className="text-blue-400">Tree-sitter AST Parsing</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mermaid Source */}
                <div className="mt-6 glass-panel p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">Mermaid Source</h3>
                        <button
                            onClick={() => navigator.clipboard.writeText(diagram.content)}
                            className="px-3 py-1 text-sm bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded transition-colors"
                        >
                            Copy
                        </button>
                    </div>
                    <pre className="bg-slate-800/50 p-4 rounded-lg overflow-x-auto text-sm text-white/80">
                        <code>{diagram.content}</code>
                    </pre>
                </div>
            </div>
        </div>
    );
}
