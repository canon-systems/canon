'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, RefreshCw, Share2, ZoomIn, ZoomOut } from 'lucide-react';
import mermaid from 'mermaid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Global Mermaid initialization flag (Mermaid best practice - initialize only once)
let mermaidInitialized = false;

// Fallback diagram generator for when Mermaid fails
function generateFallbackDiagram(mermaidContent: string, analysisData?: any): string {
    const components = analysisData?.components || [];
    const relationships = analysisData?.relationships || [];

    // Parse basic component info from Mermaid content
    const componentLines = mermaidContent.split('\n').filter(line =>
        line.trim() && !line.includes('graph TD') && !line.includes('graph LR') && !line.includes('-->')
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

                if (!diagram.content.includes('graph TD') && !diagram.content.includes('graph LR')) {
                    throw new Error('Diagram content does not appear to be valid Mermaid syntax (missing "graph TD" or "graph LR")');
                }

                // Initialize Mermaid BEFORE checking refs (Mermaid needs to be ready first)
                if (!mermaidInitialized) {
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
                    } catch (initError) {
                        console.error('Mermaid initialization failed:', initError);
                        throw new Error(`Mermaid initialization failed: ${initError instanceof Error ? initError.message : String(initError)}`);
                    }
                }

                // Wait for next tick to ensure DOM is ready (optional but safer)
                await new Promise(resolve => setTimeout(resolve, 0));

                // Use a unique ID for each render to avoid conflicts (Mermaid requirement)
                const uniqueId = `mermaid-diagram-${diagram.id}-${Date.now()}`;

                try {
                    // Try Mermaid v10 API first
                    let result;
                    try {
                        result = await mermaid.render(uniqueId, diagram.content);
                    } catch (renderError) {
                        console.error('Mermaid render failed:', renderError);
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

                    if (!svgContent || svgContent.length < 50) {
                        throw new Error('SVG content is empty or too short');
                    }

                    setRenderedSvg(svgContent);
                    setError(null);

                } catch (apiError) {
                    console.error('Mermaid API error:', apiError);

                    // Try fallback: generate HTML-based diagram from the Mermaid content
                    try {
                        const fallbackSvg = generateFallbackDiagram(diagram.content, diagram.analysis_data);
                        setRenderedSvg(fallbackSvg);
                    } catch (fallbackError) {
                        console.error('Fallback diagram generation failed:', fallbackError);
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
            <Card>
                <CardContent className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-white/70">Rendering architecture diagram...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="p-12">
                    <div className="text-center max-w-2xl mx-auto">
                        <Alert variant="destructive" className="mb-6">
                            <AlertDescription className="text-lg font-semibold mb-2">Diagram Render Error</AlertDescription>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>

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

                        <div className="flex items-center justify-center gap-4">
                            <Button onClick={() => window.location.reload()}>
                                Try Again
                            </Button>
                            <Button variant="secondary" asChild>
                                <Link href="/architecture-diagrams">Generate New</Link>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
                    <CardHeader className="space-y-1 pb-6">
                        <div className="flex items-center justify-between">
                            <Button variant="ghost" size="sm" asChild>
                                <Link href="/architecture-diagrams?tab=view">
                                    <ArrowLeft className="w-4 h-4" />
                                    Back to Diagrams
                                </Link>
                            </Button>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setZoom(Math.min(zoom + 0.2, 2))}
                                    title="Zoom In"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setZoom(Math.max(zoom - 0.2, 0.5))}
                                    title="Zoom Out"
                                >
                                    <ZoomOut className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleDownload}
                                    title="Download Diagram"
                                >
                                    <Download className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={regenerateDiagram}
                                    title="Regenerate"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                        <CardTitle className="text-2xl font-semibold text-white">{diagram.title}</CardTitle>
                        <CardDescription className="text-white/70">
                            Repository: {repo.name} • Generated: {new Date(diagram.created_at).toLocaleDateString()}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {/* Diagram */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg font-semibold text-white">Architecture Overview</CardTitle>
                                    <div className="text-sm text-white/60">
                                        {diagram.analysis_data?.components?.length || 0} components •
                                        {diagram.analysis_data?.relationships?.length || 0} relationships
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
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
                                        <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
                                            Reset Zoom
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Analysis Details */}
                        {diagram.analysis_data && (
                            <Card className="mt-6">
                                <CardHeader>
                                    <CardTitle className="text-lg font-semibold text-white">Analysis Details</CardTitle>
                                </CardHeader>
                                <CardContent>
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
                                </CardContent>
                            </Card>
                        )}

                        {/* Mermaid Source */}
                        <Card className="mt-6">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg font-semibold text-white">Mermaid Source</CardTitle>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => navigator.clipboard.writeText(diagram.content)}
                                    >
                                        Copy
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <pre className="bg-slate-800/50 p-4 rounded-lg overflow-x-auto text-sm text-white/80">
                                    <code>{diagram.content}</code>
                                </pre>
                            </CardContent>
                        </Card>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
