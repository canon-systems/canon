'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Background,
    Controls,
    MiniMap,
    Handle,
    Position,
    ReactFlow,
    useEdgesState,
    useNodesState,
    Node,
    Edge,
    ReactFlowInstance,
    MarkerType
} from 'reactflow';
import ELK from 'elkjs/lib/elk.bundled.js';
import { ArrowLeft, Filter, Search } from 'lucide-react';
import 'reactflow/dist/style.css';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

const elk = new ELK();

const repoPalette = ['#22c55e', '#38bdf8', '#f97316', '#a855f7', '#eab308', '#14b8a6', '#f472b6', '#94a3b8'];

const categoryColors: Record<string, string> = {
    entry: '#22d3ee',
    api: '#38bdf8',
    business: '#a855f7',
    data: '#14b8a6',
    ui: '#c084fc',
    infra: '#94a3b8',
    auth: '#f97316',
    config: '#eab308',
    middleware: '#22c55e',
    util: '#3b82f6',
    test: '#f472b6',
    db: '#f59e0b',
    queue: '#f97316',
    search: '#8b5cf6',
    messaging: '#06b6d4',
    observability: '#22d3ee',
    orchestration: '#38bdf8',
    storage: '#0ea5e9',
    email: '#f472b6',
    payments: '#22c55e',
    cdn: '#eab308',
    ai: '#a855f7',
    cloud: '#94a3b8',
    other: '#6b7280',
    gateway: '#22d3ee',
    analytics: '#f472b6',
    repo: '#3b82f6',
    scheduler: '#38bdf8',
    hosting: '#c084fc',
    payment: '#22c55e'
};

interface Diagram {
    id: string;
    title: string;
    content: string;
    diagram_type: string;
    analysis_data: Record<string, unknown>;
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

function extractRepoLabel(filePath?: string): string | null {
    if (!filePath) return null;
    const parts = filePath.split('/').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return null;
}

function collectRepoLabels(node: { files?: string[] }): string[] {
    const labels = new Set<string>();
    (node.files || []).forEach((fp: string) => {
        const label = extractRepoLabel(fp);
        if (label) labels.add(label);
    });
    return Array.from(labels);
}

function formatPackages(pkgs?: string[]): string {
    if (!pkgs || !pkgs.length) return '';
    if (pkgs.length <= 2) return pkgs.join(', ');
    return `${pkgs.slice(0, 2).join(', ')} +${pkgs.length - 2} more`;
}

// Removed unused functions: makeReactFlowNodes and makeReactFlowEdges
// These were replaced by expandNodes and expandEdges

async function layoutWithElk(nodes: Node[], edges: Edge[]) {
    const graph = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.spacing.nodeNode': '60',
            'elk.layered.spacing.nodeNodeBetweenLayers': '120',
            'elk.layered.spacing.edgeNodeBetweenLayers': '60',
            'elk.spacing.edgeEdge': '20'
        },
        children: nodes.map((n) => ({
            id: n.id,
            width: (n as { measured?: { width?: number }; width?: number }).measured?.width || (n as { width?: number }).width || 240,
            height: (n as { measured?: { height?: number }; height?: number }).measured?.height || (n as { height?: number }).height || 120
        })),
        edges: edges.map((e) => ({
            id: e.id,
            sources: [e.source],
            targets: [e.target]
        }))
    };

    const layout = await elk.layout(graph);
    const positions = new Map<string, { x: number; y: number }>();
    layout.children?.forEach((c) => {
        positions.set(c.id, { x: c.x || 0, y: c.y || 0 });
    });

    const laidOutNodes = nodes.map((n) => ({
        ...n,
        position: positions.get(n.id) || { x: 0, y: 0 }
    }));

    return { nodes: laidOutNodes, edges };
}

function SystemNode({ data, selected }: { 
    data: { 
        category?: string; 
        label?: string; 
        repoBadges?: Array<{ label: string; color?: string }>; 
        fileCount?: number;
        packages?: string;
    }; 
    selected: boolean 
}) {
    const border = selected ? '#22c55e' : '#1f2937';
    const categoryColor = categoryColors[data.category || 'other'] || '#3b82f6';

    return (
        <div style={{ position: 'relative' }}>
            <Handle type="target" position={Position.Left} style={{ background: '#22c55e' }} />
            <Handle type="source" position={Position.Right} style={{ background: '#38bdf8' }} />
            <div
                style={{
                    background: '#0b1220',
                    border: `2px solid ${border}`,
                    borderRadius: 10,
                    padding: 12,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                    color: '#e5e7eb',
                    minWidth: 200
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 700, color: '#fff' }}>{data.label}</div>
                    <div
                        style={{
                            background: categoryColor,
                            color: '#0b1220',
                            borderRadius: 12,
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 700
                        }}
                    >
                        {data.category || 'other'}
                    </div>
                </div>
                <div style={{ marginTop: 6, color: '#9ca3af', fontSize: 12 }}>
                    {data.fileCount !== undefined ? `${data.fileCount} files` : 'files: n/a'}
                </div>
                {data.packages && (
                    <div style={{ marginTop: 4, color: '#9ca3af', fontSize: 12 }}>{data.packages}</div>
                )}
                {data.repoBadges?.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                        {data.repoBadges.map((r: { label: string; color?: string }) => (
                            <span
                                key={r.label}
                                style={{
                                    background: r.color || '#38bdf8',
                                    color: '#0b1220',
                                    padding: '2px 8px',
                                    borderRadius: 12,
                                    fontSize: 11,
                                    fontWeight: 700
                                }}
                            >
                                {r.label}
                            </span>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

const nodeTypes = { systemNode: SystemNode };

const NO_REPO_LABEL = 'unattributed';

function getRepoLabelsWithDefault(node: { files?: string[] }): string[] {
    const labels = collectRepoLabels(node);
    if (labels.length === 0) return [NO_REPO_LABEL];
    return labels;
}

interface RawNode {
    id: string;
    label: string;
    category?: string;
    files?: string[];
    fileCount?: number;
    packages?: string[];
    source?: string;
}

function expandNodes(
    nodes: RawNode[],
    repoClassMap: Map<string, number>
): Node[] {
    const expanded: Node[] = [];
    nodes.forEach((n) => {
        const repos = getRepoLabelsWithDefault(n);
        repos.forEach((repoLabel) => {
            const idx = repoClassMap.get(repoLabel) ?? 0;
            const repoBadges = repoLabel === NO_REPO_LABEL
                ? []
                : [{
                    label: repoLabel,
                    color: repoPalette[idx % repoPalette.length] || '#38bdf8'
                }];

            expanded.push({
                id: `${repoLabel}::${n.id}`,
                type: 'systemNode',
                data: {
                    label: n.label,
                    category: n.category,
                    repoBadges,
                    fileCount: n.fileCount,
                    packages: formatPackages(n.packages),
                    source: n.source,
                    repoLabel
                },
                position: { x: 0, y: 0 },
                width: 240,
                height: 120
            });
        });
    });
    return expanded;
}

function expandEdges(
    edges: Array<{ from: string; to: string; [key: string]: unknown }>,
    nodeRepoMap: Map<string, string[]>
): Edge[] {
    const result: Edge[] = [];
    edges.forEach((edge, idx) => {
        const fromRepos = nodeRepoMap.get(edge.from) || [NO_REPO_LABEL];
        const toRepos = nodeRepoMap.get(edge.to) || [NO_REPO_LABEL];

        const intersect = fromRepos.filter((r) => toRepos.includes(r));
        const pairs = intersect.length
            ? intersect.map((r) => [r, r] as [string, string])
            : fromRepos.flatMap((fr) => toRepos.map((tr) => [fr, tr] as [string, string]));

        pairs.forEach(([fr, tr], subIdx) => {
            result.push({
                id: `e-${fr}:${edge.from}-${tr}:${edge.to}-${idx}-${subIdx}`,
                source: `${fr}::${edge.from}`,
                target: `${tr}::${edge.to}`,
                data: { kind: edge.kind, strength: edge.strength, repoFrom: fr, repoTo: tr },
                animated: false
            });
        });
    });
    return result;
}

export function ArchitectureDiagramViewer({ diagram, repo }: ArchitectureDiagramViewerProps) {
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

    const initialNodesRaw = useMemo(() => {
        const highLevelNodes = Array.isArray(diagram.analysis_data?.highLevelNodes) 
            ? diagram.analysis_data.highLevelNodes 
            : [];
        const fullNodes = Array.isArray(diagram.analysis_data?.fullNodes) 
            ? diagram.analysis_data.fullNodes 
            : [];
        return highLevelNodes.length > 0 ? highLevelNodes : fullNodes;
    }, [diagram.analysis_data]);
    const fullNodesRaw = useMemo(() => {
        const fullNodes = Array.isArray(diagram.analysis_data?.fullNodes) 
            ? diagram.analysis_data.fullNodes 
            : [];
        return fullNodes.length > 0 ? fullNodes : initialNodesRaw;
    }, [diagram.analysis_data, initialNodesRaw]);

    const initialEdgesRaw = (() => {
        const highLevelEdges = Array.isArray(diagram.analysis_data?.highLevelEdges) 
            ? diagram.analysis_data.highLevelEdges 
            : [];
        const fullEdges = Array.isArray(diagram.analysis_data?.fullEdges) 
            ? diagram.analysis_data.fullEdges 
            : [];
        return highLevelEdges.length > 0 ? highLevelEdges : fullEdges;
    })();
    const fullEdgesRaw = (Array.isArray(diagram.analysis_data?.fullEdges) 
        ? diagram.analysis_data.fullEdges 
        : []) || initialEdgesRaw;

    const allRepoLabels = useMemo(() => {
        const set = new Set<string>();
        [...initialNodesRaw, ...fullNodesRaw].forEach((n) => {
            const labels = collectRepoLabels(n);
            if (labels.length === 0) set.add(NO_REPO_LABEL);
            labels.forEach((r) => set.add(r));
        });
        return Array.from(set);
    }, [initialNodesRaw, fullNodesRaw]);

    const repoClassMap = useMemo(() => {
        const map = new Map<string, number>();
        allRepoLabels.forEach((label, idx) => map.set(label, idx));
        return map;
    }, [allRepoLabels]);

    const [repoFilter, setRepoFilter] = useState<Set<string>>(new Set(allRepoLabels));
    const [search, setSearch] = useState('');
    const [showFullGraph, setShowFullGraph] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [layoutError, setLayoutError] = useState<string | null>(null);

    const baseNodes = showFullGraph ? fullNodesRaw : initialNodesRaw;
    const baseEdges = showFullGraph ? fullEdgesRaw : initialEdgesRaw;

    const nodeRepoMap = useMemo(() => {
        const map = new Map<string, string[]>();
        baseNodes.forEach((n: { id: string; files?: string[] }) => map.set(n.id, getRepoLabelsWithDefault(n)));
        return map;
    }, [baseNodes]);

    const expandedNodes = useMemo(
        () => expandNodes(baseNodes, repoClassMap),
        [baseNodes, repoClassMap]
    );
    const expandedEdges = useMemo(
        () => expandEdges(baseEdges, nodeRepoMap),
        [baseEdges, nodeRepoMap]
    );

    const filteredNodes = useMemo(() => {
        const term = search.trim().toLowerCase();
        return expandedNodes.filter((n) => {
            const repoLabel = (n.data as { repoLabel?: string })?.repoLabel;
            let matchesRepo = false;
            if (repoFilter.size === 0) {
                matchesRepo = true;
            } else if (repoLabel === NO_REPO_LABEL) {
                matchesRepo = true;
            } else if (repoLabel !== undefined) {
                matchesRepo = repoFilter.has(repoLabel);
            }
            const matchesSearch = term ? (n.data as { label?: string })?.label?.toLowerCase().includes(term) : true;
            return matchesRepo && matchesSearch;
        });
    }, [expandedNodes, repoFilter, search]);

    const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
    const filteredEdges = useMemo(
        () => expandedEdges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)),
        [expandedEdges, filteredNodeIds]
    );

    const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);

    useEffect(() => {
        let cancelled = false;
        const runLayout = async () => {
            try {
                setLoading(true);
                const { nodes: laidOut, edges: laidEdges } = await layoutWithElk(
                    filteredNodes as unknown as Node[],
                    filteredEdges as unknown as Edge[]
                );
                if (cancelled) return;
                setNodes(laidOut);
                setEdges(laidEdges);
                setLayoutError(null);
                setLoading(false);
                if (rfInstance) {
                    rfInstance.fitView({ padding: 0.12, includeHiddenNodes: true });
                }
            } catch (err) {
                if (cancelled) return;
                setLayoutError(err instanceof Error ? err.message : String(err));
                setLoading(false);
            }
        };
        if (filteredNodes.length) {
            runLayout();
        } else {
            // Defer state updates to avoid synchronous setState warning
            setTimeout(() => {
                setLoading(false);
                setLayoutError('No nodes to layout');
            }, 0);
        }
        return () => {
            cancelled = true;
        };
    }, [filteredNodes, filteredEdges, setNodes, setEdges, rfInstance]);

    const selectedNode = useMemo(() => {
        const node = nodes.find((n) => n.id === selectedNodeId);
        return node?.data as { 
            category?: string; 
            label?: string; 
            repoBadges?: Array<{ label: string; color?: string }>; 
            files?: string[];
            fileCount?: number;
            packages?: string;
        } | undefined;
    }, [nodes, selectedNodeId]) as {
        category?: string;
        label?: string;
        repoBadges?: Array<{ label: string; color?: string }>;
        files?: string[];
        fileCount?: number;
        packages?: string;
    } | undefined;

    const neighborIds = useMemo(() => {
        if (!selectedNodeId) return new Set<string>();
        const set = new Set<string>();
        edges.forEach((e) => {
            if (e.source === selectedNodeId) set.add(e.target);
            if (e.target === selectedNodeId) set.add(e.source);
        });
        return set;
    }, [edges, selectedNodeId]);

    const decoratedEdges = useMemo(() => {
        return edges.map((e: Edge) => {
            const isHighlight =
                selectedNodeId && (e.source === selectedNodeId || e.target === selectedNodeId);
            const baseColor = (e.data as { kind?: string })?.kind === 'external' ? '#f59e0b' : '#7dd3fc';
            return {
                ...e,
                style: {
                    stroke: isHighlight ? '#22c55e' : baseColor,
                    strokeWidth: isHighlight ? 3.5 : 2,
                    opacity: selectedNodeId ? (isHighlight ? 1 : 0.3) : 0.9
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: isHighlight ? '#22c55e' : baseColor
                },
                interactionWidth: 12
            };
        });
    }, [edges, selectedNodeId]);

    const toggleRepo = (label: string) => {
        const next = new Set(repoFilter);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        setRepoFilter(next);
    };

    const diagramMeta = `${repo.name} • Generated: ${new Date(diagram.created_at).toLocaleDateString()}`;

    return (
        <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
                    <CardHeader className="space-y-1 pb-6">
                        <div className="flex items-center justify-between gap-2">
                            <Button variant="ghost" size="sm" asChild>
                                <Link href="/architecture-diagrams?tab=view">
                                    <ArrowLeft className="w-4 h-4" />
                                    Back to Diagrams
                                </Link>
                            </Button>
                        </div>
                        <CardTitle className="text-2xl font-semibold text-white">{diagram.title}</CardTitle>
                        <CardDescription className="text-white/70">{diagramMeta}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {/* Details Panel - Horizontal above diagram */}
                            <Card className="border border-white/10 bg-white/5 shadow">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg font-semibold text-white">Details</CardTitle>
                                    <CardDescription className="text-white/70">
                                        Click any node to view drill-down info.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {layoutError && (
                                        <Alert variant="destructive" className="mb-4">
                                            <AlertDescription>{layoutError}</AlertDescription>
                                        </Alert>
                                    )}
                                    {!selectedNode && (
                                        <div className="text-white/60 text-sm">
                                            Click a node to explore its details.
                                        </div>
                                    )}
                                    {selectedNode && (
                                        <div className="flex flex-wrap items-center gap-6 text-sm text-white/80">
                                            <div>
                                                <div className="text-lg font-semibold text-white mb-1">{selectedNode.label}</div>
                                                <div className="text-white/60">Category: {selectedNode.category || 'other'}</div>
                                            </div>
                                            {selectedNode.fileCount !== undefined && (
                                                <div>
                                                    <div className="text-white/60 text-xs mb-1">Files</div>
                                                    <div className="text-white font-medium">{selectedNode.fileCount}</div>
                                                </div>
                                            )}
                                            {selectedNode.packages && (
                                                <div>
                                                    <div className="text-white/60 text-xs mb-1">Packages</div>
                                                    <div className="text-white font-medium">{selectedNode.packages}</div>
                                                </div>
                                            )}
                                            {selectedNode.repoBadges?.length ? (
                                                <div>
                                                    <div className="text-white/60 text-xs mb-2">Repositories</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedNode.repoBadges.map((r: { label: string; color?: string }) => (
                                                            <Badge
                                                                key={r.label}
                                                                style={{
                                                                    background: r.color || '#38bdf8',
                                                                    color: '#0b1220'
                                                                }}
                                                            >
                                                                {r.label}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="text-white/60 text-xs mb-1">Repository</div>
                                                    <div className="text-white/60">n/a</div>
                                                </div>
                                            )}
                                            {neighborIds.size > 0 && (
                                                <div>
                                                    <div className="text-white/60 text-xs mb-1">Neighbors</div>
                                                    <div className="text-white font-medium">{neighborIds.size}</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* React Flow Diagram - Full width */}
                            <Card className="border border-white/10 bg-white/5 shadow">
                                <CardHeader className="pb-3">
                                    <div className="mt-3 flex flex-wrap items-center gap-3">
                                        <div className="relative">
                                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
                                            <Input
                                                value={search}
                                                onChange={(e) => setSearch(e.target.value)}
                                                placeholder="Search nodes..."
                                                className="pl-9 bg-slate-900/60 border-white/10 text-white"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="full-graph"
                                                checked={showFullGraph}
                                                onCheckedChange={(v) => setShowFullGraph(Boolean(v))}
                                            />
                                            <label htmlFor="full-graph" className="text-white/80 text-sm">
                                                Show full graph
                                            </label>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <Filter className="w-4 h-4 text-white/60" />
                                        {allRepoLabels.length === 0 && (
                                            <span className="text-white/60 text-sm">No repo attribution</span>
                                        )}
                                        {allRepoLabels.map((r, idx) => (
                                            <Button
                                                key={r}
                                                size="sm"
                                                variant={repoFilter.has(r) ? 'default' : 'outline'}
                                                className="h-7"
                                                style={{
                                                    borderColor: repoPalette[idx % repoPalette.length],
                                                    color: repoFilter.has(r) ? '#0b1220' : '#e5e7eb',
                                                    background: repoFilter.has(r)
                                                        ? repoPalette[idx % repoPalette.length]
                                                        : 'transparent'
                                                }}
                                                onClick={() => toggleRepo(r)}
                                            >
                                                {r}
                                            </Button>
                                        ))}
                                        {allRepoLabels.length > 0 && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setRepoFilter(new Set(allRepoLabels))}
                                            >
                                                Select all
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[700px] rounded-lg border border-white/10 bg-slate-900/60">
                                        <ReactFlow
                                            nodes={nodes}
                                            edges={decoratedEdges}
                                            onNodesChange={onNodesChange}
                                            onEdgesChange={onEdgesChange}
                                            onNodeClick={(_, n) => setSelectedNodeId(n.id)}
                                            fitView
                                            nodeTypes={nodeTypes}
                                            fitViewOptions={{ padding: 0.1 }}
                                            defaultEdgeOptions={{
                                                type: 'smoothstep',
                                                style: { stroke: '#7dd3fc', strokeWidth: 2, opacity: 0.9 },
                                                markerEnd: { type: MarkerType.ArrowClosed, color: '#7dd3fc' }
                                            }}
                                            minZoom={0.2}
                                            maxZoom={2}
                                            style={{ background: '#0f172a' }}
                                            onInit={(inst) => setRfInstance(inst)}
                                        >
                                            <MiniMap
                                                nodeStrokeColor={(n) =>
                                                    n.selected ? '#22c55e' : '#38bdf8'
                                                }
                                                nodeColor={() => '#0b1220'}
                                                maskColor="rgba(15,23,42,0.6)"
                                            />
                                            <Controls />
                                            <Background gap={20} color="#1f2937" />
                                        </ReactFlow>
                                    </div>
                                    <div className="mt-3 text-xs text-white/60">
                                        Nodes: {nodes.length} • Edges: {edges.length}{' '}
                                        {layoutError && (
                                            <span className="text-red-300">Layout error: {layoutError}</span>
                                        )}
                                    </div>
                                    {loading && (
                                        <div className="mt-2 text-sm text-white/70">Laying out graph with ELK…</div>
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
