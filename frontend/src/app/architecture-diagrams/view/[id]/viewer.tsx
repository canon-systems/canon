'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, RefreshCw, Share2, ZoomIn, ZoomOut } from 'lucide-react';
import mermaid from 'mermaid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Global Mermaid initialization flag (Mermaid best practice - initialize only once)
let mermaidInitialized = false;

function buildMermaid(nodes: any[], edges: any[]): string {
    let mermaidText = 'flowchart TB\n';
    mermaidText += '    classDef lane fill:#111827,stroke:#1f2937,color:#e5e7eb,stroke-width:1px;\n';
    mermaidText += '    classDef internal fill:#0f172a,stroke:#1d4ed8,color:#e2e8f0,stroke-width:1.5px,rx:4px,ry:4px;\n';
    mermaidText += '    classDef external fill:#1f2937,stroke:#f59e0b,color:#ffedd5,stroke-width:1.5px,rx:4px,ry:4px;\n';
    mermaidText += '    classDef unknown fill:#1f1f1f,stroke:#ef4444,color:#fecdd3,stroke-dasharray: 6 4;\n';
    const categories: Record<string, string> = {
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
    mermaidText += '    classDef cat-entry stroke:#22d3ee,color:#e0f2fe;\n';
    mermaidText += '    classDef cat-api stroke:#38bdf8,color:#e0f2fe;\n';
    mermaidText += '    classDef cat-business stroke:#a855f7,color:#f5f3ff;\n';
    mermaidText += '    classDef cat-data stroke:#14b8a6,color:#ccfbf1;\n';
    mermaidText += '    classDef cat-ui stroke:#c084fc,color:#faf5ff;\n';
    mermaidText += '    classDef cat-infra stroke:#94a3b8,color:#e2e8f0;\n';
    mermaidText += '    classDef cat-auth stroke:#f97316,color:#ffedd5;\n';
    mermaidText += '    classDef cat-config stroke:#eab308,color:#fef9c3;\n';
    mermaidText += '    classDef cat-middleware stroke:#22c55e,color:#dcfce7;\n';
    mermaidText += '    classDef cat-util stroke:#3b82f6,color:#dbeafe;\n';
    mermaidText += '    classDef cat-test stroke:#f472b6,color:#fce7f3;\n';
    mermaidText += '    classDef cat-db stroke:#f59e0b,color:#fffbeb;\n';
    mermaidText += '    classDef cat-queue stroke:#f97316,color:#ffedd5;\n';
    mermaidText += '    classDef cat-search stroke:#8b5cf6,color:#ede9fe;\n';
    mermaidText += '    classDef cat-messaging stroke:#06b6d4,color:#cffafe;\n';
    mermaidText += '    classDef cat-observability stroke:#22d3ee,color:#e0f2fe;\n';
    mermaidText += '    classDef cat-orchestration stroke:#38bdf8,color:#e0f2fe;\n';
    mermaidText += '    classDef cat-storage stroke:#0ea5e9,color:#e0f2fe;\n';
    mermaidText += '    classDef cat-email stroke:#f472b6,color:#fce7f3;\n';
    mermaidText += '    classDef cat-payments stroke:#22c55e,color:#dcfce7;\n';
    mermaidText += '    classDef cat-cdn stroke:#eab308,color:#fef9c3;\n';
    mermaidText += '    classDef cat-ai stroke:#a855f7,color:#f5f3ff;\n';
    mermaidText += '    classDef cat-cloud stroke:#94a3b8,color:#e2e8f0;\n';
    mermaidText += '    classDef cat-other stroke:#6b7280,color:#e5e7eb;\n';
    mermaidText += '    classDef cat-gateway stroke:#22d3ee,color:#e0f2fe;\n';
    mermaidText += '    classDef cat-analytics stroke:#f472b6,color:#fce7f3;\n';
    mermaidText += '    classDef cat-repo stroke:#3b82f6,color:#dbeafe;\n';
    mermaidText += '    classDef cat-scheduler stroke:#38bdf8,color:#e0f2fe;\n';
    mermaidText += '    classDef cat-hosting stroke:#c084fc,color:#faf5ff;\n';

    const internalNodes = nodes.filter(n => n.type === 'internal');
    const externalNodes = nodes.filter(n => n.type === 'external');
    const classAssignments: Array<{ id: string; cls: string }> = [];

    const formatLabel = (node: any) => {
        const parts = [node.label];
        if (node.fileCount !== undefined) parts.push(`${node.fileCount} files`);
        if (node.packages && node.packages.length) {
            const pkgLine = node.packages.slice(0, 2).join(', ') + (node.packages.length > 2 ? ` +${node.packages.length - 2} more` : '');
            parts.push(pkgLine);
        }
        return parts.join('\\n').replace(/"/g, "'");
    };

    if (internalNodes.length) {
        mermaidText += '    subgraph Internal["Internal Systems"]\n';
        mermaidText += '    direction LR\n';
        for (const node of internalNodes) {
            const cls = categories[node.category || ''] || 'internal';
            mermaidText += `        ${node.id}["${formatLabel(node)}"]:::internal\n`;
            classAssignments.push({ id: node.id, cls });
        }
        mermaidText += '    end\n';
    }

    const linkStyles: string[] = [];
    edges.forEach((edge: any, index: number) => {
        const arrowStyle = edge.kind === 'external' ? '-.->' : '-->';
        mermaidText += `    ${edge.from} ${arrowStyle} ${edge.to}\n`;
        const strokeWidth = Math.min(6, 1.5 + Math.log((edge.strength || 1) + 1));
        const dash = edge.kind === 'external' ? 'stroke-dasharray: 6 4,' : '';
        const strokeColor = edge.kind === 'external' ? '#f59e0b' : '#7dd3fc';
        linkStyles.push(`    linkStyle ${index} stroke:${strokeColor},stroke-width:${strokeWidth},${dash}opacity:0.9;`);
    });

    if (linkStyles.length) {
        mermaidText += linkStyles.join('\n') + '\n';
    }
    if (classAssignments.length) {
        for (const assignment of classAssignments) {
            mermaidText += `    class ${assignment.id} ${assignment.cls};\n`;
        }
    }
    return mermaidText;
}

// Fallback diagram generator for when Mermaid fails
function generateFallbackDiagram(mermaidContent: string, analysisData?: any): string {
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
            Mermaid rendering failed
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

    svg += `
        <!-- Footer message -->
        <text x="50%" y="${height - 30}" text-anchor="middle" fill="#64748b" font-family="Arial" font-size="11">
            This is a fallback diagram. Mermaid rendering failed.
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
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const initialNodes = (diagram.analysis_data?.highLevelNodes || []).length
        ? diagram.analysis_data?.highLevelNodes
        : (diagram.analysis_data?.fullNodes || []);
    const initialEdges = (diagram.analysis_data?.highLevelEdges || []).length
        ? diagram.analysis_data?.highLevelEdges
        : (diagram.analysis_data?.fullEdges || []);
    const fullNodes = diagram.analysis_data?.fullNodes || initialNodes;
    const fullEdges = diagram.analysis_data?.fullEdges || initialEdges;

    const [visibleNodes, setVisibleNodes] = useState<any[]>(initialNodes);
    const [visibleEdges, setVisibleEdges] = useState<any[]>(initialEdges);
    const [mermaidSource, setMermaidSource] = useState<string>(() => buildMermaid(initialNodes, initialEdges));

    const nodeMap = useMemo(() => {
        const map = new Map<string, any>();
        visibleNodes.forEach((node: any) => map.set(node.id, node));
        return map;
    }, [visibleNodes]);

    const fullNodeMap = useMemo(() => {
        const map = new Map<string, any>();
        fullNodes.forEach((node: any) => map.set(node.id, node));
        return map;
    }, [fullNodes]);

    const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;

    const relatedEdges = useMemo(() => {
        if (!selectedNode) return [];
        return visibleEdges.filter((e: any) => e.from === selectedNode.id || e.to === selectedNode.id);
    }, [visibleEdges, selectedNode]);

    const neighborEntries = useMemo(() => {
        if (!selectedNode) return [];
        return relatedEdges.map((edge: any) => {
            const otherId = edge.from === selectedNode.id ? edge.to : edge.from;
            return {
                otherId,
                other: nodeMap.get(otherId) || fullNodeMap.get(otherId),
                strength: edge.strength,
                kind: edge.kind
            };
        });
    }, [relatedEdges, selectedNode, nodeMap, fullNodeMap]);

    const expandNode = (nodeId: string) => {
        const ids = new Set<string>(visibleNodes.map(n => n.id));
        ids.add(nodeId);
        fullEdges.forEach((e: any) => {
            if (e.from === nodeId || e.to === nodeId) {
                ids.add(e.from);
                ids.add(e.to);
            }
        });
        const newNodes = fullNodes.filter((n: any) => ids.has(n.id));
        const newEdges = fullEdges.filter((e: any) => ids.has(e.from) && ids.has(e.to));
        setVisibleNodes(newNodes);
        setVisibleEdges(newEdges);
        setSelectedNodeId(nodeId);
    };

    const resetView = () => {
        setVisibleNodes(initialNodes);
        setVisibleEdges(initialEdges);
        setSelectedNodeId(null);
    };

    useEffect(() => {
        const source = buildMermaid(visibleNodes, visibleEdges);
        setMermaidSource(source);
    }, [visibleNodes, visibleEdges]);

    useEffect(() => {
        const renderDiagram = async () => {
            try {
                if (!mermaidSource || mermaidSource.trim().length === 0) {
                    throw new Error('Diagram content is empty');
                }

                if (!mermaidSource.includes('flowchart')) {
                    throw new Error('Diagram content does not appear to be valid Mermaid syntax');
                }

                if (!mermaidInitialized) {
                    try {
                        mermaid.initialize({
                            startOnLoad: false,
                            theme: 'base',
                            themeVariables: {
                                background: '#1e293b',
                                primaryColor: '#3b82f6',
                                primaryTextColor: '#ffffff',
                                primaryBorderColor: '#60a5fa',
                                lineColor: '#94a3b8',
                                secondaryColor: '#64748b',
                                tertiaryColor: '#475569',
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
                            securityLevel: 'loose'
                        });
                        mermaidInitialized = true;
                    } catch (initError) {
                        console.error('Mermaid initialization failed:', initError);
                        throw new Error(`Mermaid initialization failed: ${initError instanceof Error ? initError.message : String(initError)}`);
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 0));
                const uniqueId = `mermaid-diagram-${diagram.id}-${Date.now()}`;

                let result;
                try {
                    result = await mermaid.render(uniqueId, mermaidSource);
                } catch (renderError) {
                    console.error('Mermaid render failed:', renderError);
                    throw renderError;
                }

                let svgContent = '';
                if (typeof result === 'string') {
                    svgContent = result;
                } else if (result && typeof result === 'object') {
                    svgContent = (result as any).svg || String(result);
                } else {
                    throw new Error('Unexpected Mermaid render result format');
                }

                if (!svgContent || svgContent.length < 50) {
                    throw new Error('SVG content is empty or too short');
                }

                setRenderedSvg(svgContent);
                setError(null);
                setLoading(false);
            } catch (err) {
                console.error('Failed to render Mermaid diagram:', err);
                console.error('Diagram content:', mermaidSource);
                setError(`Failed to render diagram: ${err instanceof Error ? err.message : String(err)}`);
                try {
                    const fallbackSvg = generateFallbackDiagram(mermaidSource, diagram.analysis_data);
                    setRenderedSvg(fallbackSvg);
                } catch {
                    // ignore
                }
                setLoading(false);
            }
        };

        renderDiagram();
    }, [mermaidSource, diagram.id, diagram.analysis_data]);

    // Attach click handlers for drill-down once SVG is rendered
    useEffect(() => {
        if (!renderedSvg) return;
        const container = diagramRef.current;
        const svg = container?.querySelector('svg');
        if (!svg) return;

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            const group = target.closest('g[id]');
            const nodeId = group?.getAttribute('id');
            if (nodeId && (nodeMap.has(nodeId) || fullNodeMap.has(nodeId))) {
                event.stopPropagation();
                expandNode(nodeId);
            }
        };

        svg.addEventListener('click', handleClick);
        return () => {
            svg.removeEventListener('click', handleClick);
        };
    }, [renderedSvg, nodeMap, fullNodeMap, expandNode]);

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
            const file = new Blob([mermaidSource], { type: 'text/plain' });
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
                                        <code>{mermaidSource}</code>
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
                                    size="sm"
                                    onClick={resetView}
                                    title="Reset View"
                                >
                                    Reset View
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
                        <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
                            <Card className="border border-white/10 bg-white/5 shadow">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg font-semibold text-white">Architecture Overview</CardTitle>
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

                            <Card className="border border-white/10 bg-white/5 shadow">
                                <CardHeader>
                                    <CardTitle className="text-lg font-semibold text-white">Details</CardTitle>
                                    <CardDescription className="text-white/70">
                                        Click any node in the diagram to view drill-down info.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {selectedNode ? (
                                        <div className="space-y-4">
                                            <div className="space-y-1">
                                                <div className="text-sm uppercase tracking-wide text-white/60">Selected</div>
                                                <div className="text-white font-semibold">{selectedNode.label}</div>
                                                <div className="text-white/60 text-sm">
                                                    {selectedNode.role ? `Category: ${selectedNode.role}` : selectedNode.type === 'internal' ? 'Internal' : 'External'}
                                                </div>
                                                <div className="text-white/60 text-sm">
                                                    Files: {selectedNode.fileCount ?? 0} • Source: {selectedNode.source || 'code'}
                                                </div>
                                            </div>

                                            {selectedNode.packages && selectedNode.packages.length > 0 && (
                                                <div>
                                                    <div className="text-sm font-medium text-white mb-2">Packages</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedNode.packages.slice(0, 12).map((pkg: string) => (
                                                            <span key={pkg} className="px-2 py-1 rounded bg-white/10 text-xs text-white/80">
                                                                {pkg}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {neighborEntries.length > 0 && (
                                                <div>
                                                    <div className="text-sm font-medium text-white mb-2">Connections</div>
                                                    <div className="space-y-1">
                                                        {neighborEntries.map((entry, idx) => (
                                                            <div key={idx} className="flex items-center justify-between text-sm text-white/80">
                                                                <span>{entry.other?.label || entry.otherId}</span>
                                                                <span className="text-white/60">{entry.strength} links</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {selectedNode.files && selectedNode.files.length > 0 && (
                                                <div>
                                                    <div className="text-sm font-medium text-white mb-2">Files referencing this</div>
                                                    <div className="space-y-1 max-h-48 overflow-auto pr-1 text-xs text-white/70">
                                                        {selectedNode.files.slice(0, 15).map((file: string) => (
                                                            <div key={file} className="truncate">{file}</div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                <Button size="sm" onClick={() => expandNode(selectedNode.id)}>
                                                    Expand neighbors
                                                </Button>
                                                <Button size="sm" variant="secondary" onClick={resetView}>
                                                    Collapse
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-white/60 text-sm">Click a node to explore its details.</div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
