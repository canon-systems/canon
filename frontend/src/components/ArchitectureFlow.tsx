'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { DetectionResult } from '@/lib/server/architecture/detectTools';
import { ToolIcon } from './ToolIcon';
import dagre from 'dagre';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ArchitectureFlowProps {
  detectionResult: DetectionResult;
}

// Define tool groupings by language/runtime
const TOOL_GROUPINGS: Record<string, string[]> = {
  'javascript': ['react', 'nextjs', 'vite', 'tailwindcss', 'tiptap', 'jszip', 'marked', 'turndown', 'express', 'nodejs'],
  'typescript': ['react', 'nextjs', 'vite', 'tailwindcss', 'tiptap', 'jszip', 'marked', 'turndown', 'express', 'nodejs', 'typescript'],
  'python': ['python', 'django', 'flask', 'fastapi'],
  'sveltekit': ['sveltekit', 'vite', 'tailwindcss'],
};

// Determine which parent category a tool belongs to
function getToolParent(toolName: string, allTools: DetectionResult['tools']): string | null {
  const normalized = toolName.toLowerCase();

  // Check if TypeScript is detected in the codebase
  const hasTypeScript = allTools.some(t => t.name.toLowerCase() === 'typescript');

  // Check each grouping
  for (const [parent, tools] of Object.entries(TOOL_GROUPINGS)) {
    if (tools.some(t => {
      const toolNormalized = t.toLowerCase();
      return normalized === toolNormalized ||
        normalized.includes(toolNormalized) ||
        toolNormalized.includes(normalized);
    })) {
      // If it's a JS/TS tool and TypeScript is detected, use TypeScript parent
      if ((parent === 'javascript' || parent === 'typescript') && hasTypeScript) {
        return 'typescript';
      }
      if (parent === 'javascript' && !hasTypeScript) {
        return 'javascript';
      }
      if (parent === 'typescript' && hasTypeScript) {
        return 'typescript';
      }
      return parent;
    }
  }

  // Special cases for JS/TS tools
  const jsTools = ['react', 'nextjs', 'next', 'vite', 'tailwindcss', 'tailwind', 'tiptap', 'jszip', 'marked', 'turndown', 'express', 'nodejs', 'node'];
  if (jsTools.some(t => normalized.includes(t) || t.includes(normalized))) {
    return hasTypeScript ? 'typescript' : 'javascript';
  }

  return null;
}

// Modern gradient colors for different categories
function getNodeGradient(category: string, isParent: boolean = false): string {
  if (isParent) {
    switch (category) {
      case 'javascript':
      case 'typescript':
        return 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)';
      case 'python':
        return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)';
      case 'sveltekit':
        return 'linear-gradient(135deg, #ff3e00 0%, #ff6b00 50%, #ff8c00 100%)';
      default:
        return 'linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #4338ca 100%)';
    }
  }

  switch (category) {
    case 'internal':
      return 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)';
    case 'external':
      return 'linear-gradient(135deg, #374151 0%, #4b5563 50%, #6b7280 100%)';
    case 'frontend':
      return 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c084fc 100%)';
    default:
      return 'linear-gradient(135deg, #4b5563 0%, #6b7280 50%, #9ca3af 100%)';
  }
}

function getNodeBorderColor(category: string, isParent: boolean = false): string {
  if (isParent) {
    switch (category) {
      case 'javascript':
      case 'typescript':
        return '#fbbf24';
      case 'python':
        return '#60a5fa';
      case 'sveltekit':
        return '#ff6b00';
      default:
        return '#818cf8';
    }
  }

  switch (category) {
    case 'internal':
      return '#60a5fa';
    case 'external':
      return '#9ca3af';
    case 'frontend':
      return '#c084fc';
    default:
      return '#d1d5db';
  }
}

function getNodeGlowColor(category: string, isParent: boolean = false): string {
  if (isParent) {
    switch (category) {
      case 'javascript':
      case 'typescript':
        return 'rgba(251, 191, 36, 0.5)';
      case 'python':
        return 'rgba(59, 130, 246, 0.5)';
      case 'sveltekit':
        return 'rgba(255, 107, 0, 0.5)';
      default:
        return 'rgba(129, 140, 248, 0.5)';
    }
  }

  switch (category) {
    case 'internal':
      return 'rgba(59, 130, 246, 0.4)';
    case 'external':
      return 'rgba(156, 163, 175, 0.3)';
    case 'frontend':
      return 'rgba(168, 85, 247, 0.4)';
    default:
      return 'rgba(209, 213, 219, 0.3)';
  }
}

// Build tool groupings and hierarchy
function buildToolGroups(tools: DetectionResult['tools']) {
  const toolGroups = new Map<string, DetectionResult['tools']>();
  const standaloneTools: DetectionResult['tools'] = [];

  // Group tools by parent category
  tools.forEach(tool => {
    const parent = getToolParent(tool.name, tools);
    if (parent) {
      if (!toolGroups.has(parent)) {
        toolGroups.set(parent, []);
      }
      toolGroups.get(parent)!.push(tool);
    } else {
      standaloneTools.push(tool);
    }
  });

  return { toolGroups, standaloneTools };
}

function convertToNodesAndEdges(
  detectionResult: DetectionResult,
  expandedGroups: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const { tools, connections } = detectionResult;

  // Build tool groups
  const { toolGroups, standaloneTools } = buildToolGroups(tools);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Create parent nodes for each group
  toolGroups.forEach((groupTools, parentName) => {
    const isExpanded = expandedGroups.has(parentName);
    const displayName = parentName === 'javascript' || parentName === 'typescript'
      ? 'JavaScript/TypeScript'
      : parentName.charAt(0).toUpperCase() + parentName.slice(1);

    // Parent node
    nodes.push({
      id: `parent_${parentName}`,
      type: 'default',
      data: {
        label: (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-white/70" />
              ) : (
                <ChevronRight className="h-4 w-4 text-white/70" />
              )}
              <ToolIcon toolName={parentName} size={28} />
              <span className="font-bold text-lg">{displayName}</span>
            </div>
            <span className="text-xs text-white/60">
              {groupTools.length} {groupTools.length === 1 ? 'tool' : 'tools'}
            </span>
          </div>
        ),
        isParent: true,
        parentName,
        childTools: groupTools,
        isExpanded,
      },
      position: { x: 0, y: 0 },
      style: {
        background: getNodeGradient(parentName, true),
        border: `3px solid ${getNodeBorderColor(parentName, true)}`,
        color: '#ffffff',
        borderRadius: '16px',
        padding: '20px 24px',
        fontSize: '16px',
        fontWeight: 700,
        minWidth: 280,
        minHeight: 100,
        boxShadow: `0 6px 20px 0 ${getNodeGlowColor(parentName, true)}, 0 4px 6px rgba(0,0,0,0.4)`,
        cursor: 'pointer',
      },
    });

    // Add child nodes if expanded
    if (isExpanded) {
      groupTools.forEach((tool) => {
        const category = tool.category === 'internal'
          ? (tool.name === 'sveltekit' || tool.name === 'react' || tool.name === 'nextjs' ? 'frontend' : 'internal')
          : tool.category;

        nodes.push({
          id: tool.name.replace(/[^a-zA-Z0-9]/g, '_'),
          type: 'default',
          data: {
            label: (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2">
                  <ToolIcon toolName={tool.name} size={24} />
                  <span className="font-semibold text-sm">{tool.name}</span>
                </div>
                {tool.description && (
                  <span className="text-xs text-white/70 font-normal">{tool.description}</span>
                )}
              </div>
            ),
            description: tool.description,
            category,
            toolName: tool.name,
            parentName,
          },
          position: { x: 0, y: 0 },
          style: {
            background: getNodeGradient(category),
            border: `2px solid ${getNodeBorderColor(category)}`,
            color: '#ffffff',
            borderRadius: '12px',
            padding: '14px 18px',
            fontSize: '13px',
            fontWeight: 600,
            minWidth: 200,
            minHeight: 80,
            boxShadow: `0 4px 14px 0 ${getNodeGlowColor(category)}, 0 2px 4px rgba(0,0,0,0.3)`,
            marginLeft: '40px', // Indent children
          },
        });

        // Create edge from parent to child
        edges.push({
          id: `parent_${parentName}_to_${tool.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
          source: `parent_${parentName}`,
          target: tool.name.replace(/[^a-zA-Z0-9]/g, '_'),
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: 'rgba(255, 255, 255, 0.3)',
            strokeWidth: 2,
            strokeDasharray: '5,5',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'rgba(255, 255, 255, 0.3)',
            width: 16,
            height: 16,
          },
        });
      });
    }
  });

  // Add standalone tools (not in any group)
  standaloneTools.forEach(tool => {
    const category = tool.category === 'internal'
      ? (tool.name === 'sveltekit' || tool.name === 'react' || tool.name === 'nextjs' ? 'frontend' : 'internal')
      : tool.category;

    nodes.push({
      id: tool.name.replace(/[^a-zA-Z0-9]/g, '_'),
      type: 'default',
      data: {
        label: (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <ToolIcon toolName={tool.name} size={24} />
              <span className="font-semibold text-sm">{tool.name}</span>
            </div>
            {tool.description && (
              <span className="text-xs text-white/70 font-normal">{tool.description}</span>
            )}
          </div>
        ),
        description: tool.description,
        category,
        toolName: tool.name,
      },
      position: { x: 0, y: 0 },
      style: {
        background: getNodeGradient(category),
        border: `2px solid ${getNodeBorderColor(category)}`,
        color: '#ffffff',
        borderRadius: '12px',
        padding: '14px 18px',
        fontSize: '13px',
        fontWeight: 600,
        minWidth: 200,
        minHeight: 80,
        boxShadow: `0 4px 14px 0 ${getNodeGlowColor(category)}, 0 2px 4px rgba(0,0,0,0.3)`,
      },
    });
  });

  // Add connections between tools (only show if both nodes exist)
  connections.forEach((conn) => {
    const fromId = conn.from.replace(/[^a-zA-Z0-9]/g, '_');
    const toId = conn.to.replace(/[^a-zA-Z0-9]/g, '_');

    // Only add edge if both nodes exist (not hidden in collapsed groups)
    const fromNode = nodes.find(n => n.id === fromId || n.data.toolName === conn.from);
    const toNode = nodes.find(n => n.id === toId || n.data.toolName === conn.to);

    if (fromNode && toNode && !fromNode.data.isParent && !toNode.data.isParent) {
      edges.push({
        id: `${conn.from}_${conn.to}`,
        source: fromNode.id,
        target: toNode.id,
        label: conn.label || '',
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: 'rgba(255, 255, 255, 0.5)',
          strokeWidth: 2.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'rgba(255, 255, 255, 0.5)',
          width: 20,
          height: 20,
        },
        labelStyle: {
          fill: '#ffffff',
          background: 'rgba(31, 41, 55, 0.9)',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 500,
          backdropFilter: 'blur(8px)',
        },
        labelBgStyle: {
          fill: 'rgba(31, 41, 55, 0.9)',
          fillOpacity: 0.9,
        },
      });
    }
  });

  // Enhanced Dagre layout
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: 'TB',
    nodesep: 80,
    ranksep: 120,
    align: 'UL',
    marginx: 60,
    marginy: 60,
    acyclicer: 'greedy',
    ranker: 'tight-tree',
  });

  // Set node dimensions
  nodes.forEach((node) => {
    const isParent = node.data.isParent || false;
    const width = isParent ? 300 : 220;
    const height = isParent ? 120 : 100;
    g.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  // Apply positions
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    const isParent = node.data.isParent || false;
    const width = isParent ? 300 : 220;
    const height = isParent ? 120 : 100;

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
      style: {
        ...node.style,
        minWidth: width,
        minHeight: height,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

export function ArchitectureFlow({ detectionResult }: ArchitectureFlowProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => convertToNodesAndEdges(detectionResult, expandedGroups),
    [detectionResult, expandedGroups]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Handle node click for expand/collapse
  const onNodeClick = useCallback((_event: any, node: Node) => {
    if (node.data?.isParent) {
      const parentName = node.data.parentName;
      setExpandedGroups(prev => {
        const next = new Set(prev);
        if (next.has(parentName)) {
          next.delete(parentName);
        } else {
          next.add(parentName);
        }
        return next;
      });
    }
  }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Update nodes when expandedGroups changes
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = convertToNodesAndEdges(detectionResult, expandedGroups);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [detectionResult, expandedGroups, setNodes, setEdges]);

  return (
    <div className="h-[700px] w-full rounded-2xl border border-white/20 bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 shadow-2xl overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
        className="bg-transparent"
        nodeTypes={{}}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color="rgba(255,255,255,0.08)"
          className="opacity-50"
        />
        <Controls
          className="bg-black/60 backdrop-blur-md border border-white/20 rounded-lg shadow-lg"
          showInteractive={false}
        />
        <MiniMap
          className="bg-black/60 backdrop-blur-md border border-white/20 rounded-lg shadow-lg"
          nodeColor={(node) => {
            if (node.data?.isParent) {
              return '#fbbf24';
            }
            const category = node.data?.category || 'default';
            switch (category) {
              case 'internal':
                return '#3b82f6';
              case 'external':
                return '#6b7280';
              case 'frontend':
                return '#a855f7';
              default:
                return '#9ca3af';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.6)"
        />
      </ReactFlow>

      <style jsx global>{`
        .react-flow__node {
          transition: all 0.2s ease;
        }
        .react-flow__node:hover {
          transform: scale(1.05);
          z-index: 10;
        }
        .react-flow__edge {
          transition: all 0.2s ease;
        }
        .react-flow__edge:hover {
          stroke-width: 3px !important;
        }
        .react-flow__edge-path {
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
        }
        .react-flow__controls-button {
          background: rgba(255, 255, 255, 0.1) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          color: white !important;
        }
        .react-flow__controls-button:hover {
          background: rgba(255, 255, 255, 0.2) !important;
        }
      `}</style>
    </div>
  );
}
