'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { RefreshCw, ArrowRight, Activity, Eye, EyeOff } from 'lucide-react';

// ═══════════════════════════════════════════════════════
//  Node & Edge Definitions
// ═══════════════════════════════════════════════════════

interface FlowNode {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  group: 'input' | 'process' | 'api' | 'ai' | 'storage' | 'output';
  x: number;
  y: number;
  file?: string;
  fnName?: string;
  description?: string;
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  animated?: boolean;
}

const BASE_NODES: FlowNode[] = [
  // Row 1: Input
  { id: 'csv', label: 'CSV Import', sublabel: '—', icon: '📄', color: '#8b5cf6', group: 'input', x: 80, y: 60, file: 'api/leads/import/route.ts', fnName: 'POST /api/leads/import', description: 'Parses raw CSV data, extracts Instagram URLs, cleans parameters, and deduplicates entries.' },
  { id: 'parse', label: 'URL Parser', sublabel: 'Clean & Extract', icon: '🔍', color: '#8b5cf6', group: 'process', x: 320, y: 60, file: 'api/leads/import/route.ts', fnName: 'extractUsername()', description: 'Strips URL params, trailing slashes, and extracts clean Instagram usernames from various URL formats.' },
  { id: 'dedup', label: 'Deduplicator', sublabel: '—', icon: '🔄', color: '#8b5cf6', group: 'process', x: 560, y: 60, file: 'api/leads/import/route.ts', fnName: 'Set<string>', description: 'Uses a Set to track seen usernames, skipping duplicates. Case-insensitive matching.' },
  { id: 'db_leads', label: 'Leads Table', sublabel: '—', icon: '💾', color: '#06b6d4', group: 'storage', x: 800, y: 60, file: 'lib/db.ts', fnName: 'leads', description: 'Stores username, CSV metadata (niche, followers_range, HQ score), fetch_status, and linked profile_id.' },

  // Row 2: Batch Processing
  { id: 'batch', label: 'Batch Engine', sublabel: '—', icon: '⚡', color: '#f59e0b', group: 'process', x: 80, y: 220, file: 'api/leads/batch/route.ts', fnName: 'processBatch()', description: 'Iterates over pending/error leads, orchestrates fetch → store → analyze → update cycle. Tracks progress in batch_jobs table.' },
  { id: 'rate', label: 'Rate Limiter', sublabel: '5s interval', icon: '⏱', color: '#f59e0b', group: 'process', x: 320, y: 220, file: 'lib/services/instagram-client.ts', fnName: 'RateLimiter', description: 'Queue-based rate limiter. 5s between requests (~12/min). Prevents Meta API throttling.' },
  { id: 'retry', label: 'Retry Logic', sublabel: '—', icon: '🔁', color: '#f59e0b', group: 'process', x: 560, y: 220, file: 'lib/services/instagram-client.ts', fnName: 'fetchWithRetry()', description: 'Exponential backoff for Error #4 and HTTP 429. Waits 60s → 120s → 240s → 480s. Max 4 retries.' },
  { id: 'ig_api', label: 'Instagram API', sublabel: '—', icon: '📡', color: '#ec4899', group: 'api', x: 800, y: 220, file: 'lib/services/instagram-client.ts', fnName: 'fetchProfileByUsername()', description: 'Calls Meta business_discovery endpoint. Returns profile data + 25 recent media posts. Only works for Business/Creator accounts.' },

  // Row 3: Storage & Analysis
  { id: 'db_profiles', label: 'Profiles Table', sublabel: '—', icon: '💾', color: '#06b6d4', group: 'storage', x: 80, y: 380, file: 'lib/db.ts', fnName: 'profiles', description: 'Stores fetched Instagram profile data: username, bio, followers, following, media_count, profile_pic, website, verified status.' },
  { id: 'db_media', label: 'Media Table', sublabel: '—', icon: '💾', color: '#06b6d4', group: 'storage', x: 320, y: 380, file: 'lib/db.ts', fnName: 'media', description: 'Stores individual posts: media_type, caption, like_count, comments_count, timestamp, permalink.' },
  { id: 'metrics', label: 'Metrics Calc', sublabel: 'Engagement Rate', icon: '📊', color: '#10b981', group: 'process', x: 560, y: 380, file: 'api/leads/batch/route.ts', fnName: 'engRate = (likes+comments)/followers', description: 'Calculates avg_likes, avg_comments, and engagement_rate from stored media data. Feeds into AI analysis.' },
  { id: 'prefilter', label: 'Pre-Filter', sublabel: '—', icon: '🚦', color: '#10b981', group: 'process', x: 800, y: 380, file: 'lib/services/pre-filter.ts', fnName: 'applyPreFilters()', description: 'Gates profiles before AI: min_followers (5K), min_engagement (1%), min_english (60%), min_posts/month (2). Configurable in Settings.' },

  // Row 4: AI & Output
  { id: 'gemini', label: 'Gemini AI', sublabel: '—', icon: '🤖', color: '#ef4444', group: 'ai', x: 80, y: 540, file: 'lib/services/ai-analyzer.ts', fnName: 'analyzeProfile()', description: 'Sends profile + 25 captions to Gemini. Returns: primary/secondary cluster, relevance/authority scores, monetization signals, risk flags, tier (A/B/C/D).' },
  { id: 'classify', label: 'Classification', sublabel: '—', icon: '🏷️', color: '#ef4444', group: 'ai', x: 320, y: 540, file: 'lib/services/ai-analyzer.ts', fnName: 'ClassificationResult', description: 'Niche taxonomy: Dating, Mindset, Relationships, Masculinity. Tier system: A (elite) → D (low quality). Includes monetization signals and risk flags.' },
  { id: 'db_analysis', label: 'Analysis Results', sublabel: '—', icon: '💾', color: '#06b6d4', group: 'storage', x: 560, y: 540, file: 'lib/db.ts', fnName: 'analysis_results', description: 'Stores AI classification: cluster, scores, tier, monetization_signals (JSON), risk_flags (JSON), content_summary.' },
  { id: 'candidates', label: 'Candidates', sublabel: '—', icon: '👥', color: '#22c55e', group: 'output', x: 800, y: 540, file: 'app/candidates/page.tsx', fnName: '/candidates', description: 'Displays classified profiles ranked by authority score and tier. Filterable by cluster, tier, and engagement rate.' },
];

// Map from API node key to node id
const NODE_KEY_MAP: Record<string, string> = {
  csv_import: 'csv', url_parser: 'parse', deduplicator: 'dedup', leads_table: 'db_leads',
  batch_engine: 'batch', rate_limiter: 'rate', retry_logic: 'retry', instagram_api: 'ig_api',
  profiles_table: 'db_profiles', media_table: 'db_media', metrics_calc: 'metrics', pre_filter: 'prefilter',
  gemini_ai: 'gemini', classification: 'classify', analysis_results: 'db_analysis', candidates: 'candidates',
};

const EDGES: FlowEdge[] = [
  // Row 1: CSV Pipeline
  { from: 'csv', to: 'parse', label: 'raw text' },
  { from: 'parse', to: 'dedup', label: 'usernames' },
  { from: 'dedup', to: 'db_leads', label: 'upsert' },

  // Row 1 → Row 2: Batch trigger
  { from: 'db_leads', to: 'batch', label: 'pending leads' },

  // Row 2: Fetch Pipeline
  { from: 'batch', to: 'rate', label: 'each lead' },
  { from: 'rate', to: 'retry', label: 'throttled' },
  { from: 'retry', to: 'ig_api', label: 'request', animated: true },

  // Row 2 → Row 3: Store
  { from: 'ig_api', to: 'db_profiles', label: 'profile data' },
  { from: 'ig_api', to: 'db_media', label: 'media[]' },

  // Row 3: Analysis
  { from: 'db_media', to: 'metrics', label: 'compute' },
  { from: 'db_profiles', to: 'prefilter' },
  { from: 'metrics', to: 'prefilter', label: 'eng. rate' },

  // Row 3 → Row 4: AI
  { from: 'prefilter', to: 'gemini', label: 'passed ✓' },
  { from: 'gemini', to: 'classify', label: 'JSON', animated: true },
  { from: 'classify', to: 'db_analysis', label: 'store' },
  { from: 'db_analysis', to: 'candidates', label: 'query' },
];

// ═══════════════════════════════════════════════════════
//  Styling
// ═══════════════════════════════════════════════════════

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

const GROUP_COLORS: Record<string, { bg: string; border: string; glow: string }> = {
  input: { bg: '#8b5cf620', border: '#8b5cf680', glow: '#8b5cf6' },
  process: { bg: '#f59e0b15', border: '#f59e0b60', glow: '#f59e0b' },
  api: { bg: '#ec489920', border: '#ec489980', glow: '#ec4899' },
  ai: { bg: '#ef444420', border: '#ef444480', glow: '#ef4444' },
  storage: { bg: '#06b6d418', border: '#06b6d460', glow: '#06b6d4' },
  output: { bg: '#22c55e18', border: '#22c55e60', glow: '#22c55e' },
};

// ═══════════════════════════════════════════════════════
//  SVG Helpers
// ═══════════════════════════════════════════════════════

function getNodeCenter(node: FlowNode): { x: number; y: number } {
  return { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT / 2 };
}

function buildEdgePath(from: FlowNode, to: FlowNode): string {
  const s = getNodeCenter(from);
  const e = getNodeCenter(to);

  // Determine connection points
  const dx = e.x - s.x;
  const dy = e.y - s.y;

  let sx: number, sy: number, ex: number, ey: number;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection
    if (dx > 0) {
      sx = from.x + NODE_WIDTH;
      sy = s.y;
      ex = to.x;
      ey = e.y;
    } else {
      sx = from.x;
      sy = s.y;
      ex = to.x + NODE_WIDTH;
      ey = e.y;
    }
  } else {
    // Vertical connection
    if (dy > 0) {
      sx = s.x;
      sy = from.y + NODE_HEIGHT;
      ex = e.x;
      ey = to.y;
    } else {
      sx = s.x;
      sy = from.y;
      ex = e.x;
      ey = to.y + NODE_HEIGHT;
    }
  }

  const cx1 = sx + (ex - sx) * 0.5;
  const cy1 = sy;
  const cx2 = sx + (ex - sx) * 0.5;
  const cy2 = ey;

  return `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${ex} ${ey}`;
}

// ═══════════════════════════════════════════════════════
//  Components
// ═══════════════════════════════════════════════════════

function NodeCard({ node, selected, onClick }: { node: FlowNode; selected: boolean; onClick: () => void }) {
  const colors = GROUP_COLORS[node.group];

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Glow effect when selected */}
      {selected && (
        <rect
          x={node.x - 4}
          y={node.y - 4}
          width={NODE_WIDTH + 8}
          height={NODE_HEIGHT + 8}
          rx={14}
          fill="none"
          stroke={colors.glow}
          strokeWidth={2}
          opacity={0.6}
        >
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
        </rect>
      )}
      {/* Card background */}
      <rect
        x={node.x}
        y={node.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={10}
        fill={colors.bg}
        stroke={selected ? colors.glow : colors.border}
        strokeWidth={selected ? 2 : 1}
        className="transition-all"
      />
      {/* Icon */}
      <text
        x={node.x + 16}
        y={node.y + NODE_HEIGHT / 2 + 1}
        fontSize={20}
        dominantBaseline="middle"
      >
        {node.icon}
      </text>
      {/* Label */}
      <text
        x={node.x + 44}
        y={node.y + 30}
        fontSize={13}
        fontWeight={600}
        fill="white"
        dominantBaseline="middle"
      >
        {node.label}
      </text>
      {/* Sublabel */}
      <text
        x={node.x + 44}
        y={node.y + 52}
        fontSize={10}
        fill="#a1a1aa"
        dominantBaseline="middle"
      >
        {node.sublabel}
      </text>
    </g>
  );
}

function EdgeLine({ edge, nodes }: { edge: FlowEdge; nodes: FlowNode[] }) {
  const from = nodes.find(n => n.id === edge.from);
  const to = nodes.find(n => n.id === edge.to);
  if (!from || !to) return null;

  const path = buildEdgePath(from, to);
  const id = `edge-${edge.from}-${edge.to}`;

  return (
    <g>
      {/* Shadow line */}
      <path d={path} stroke="#27272a" strokeWidth={3} fill="none" />

      {/* Actual path */}
      <path
        d={path}
        stroke="#52525b"
        strokeWidth={1.5}
        fill="none"
        strokeDasharray={edge.animated ? '6 4' : undefined}
        markerEnd="url(#arrowhead)"
      >
        {edge.animated && (
          <animate
            attributeName="stroke-dashoffset"
            values="20;0"
            dur="1s"
            repeatCount="indefinite"
          />
        )}
      </path>

      {/* Edge label */}
      {edge.label && (
        <>
          <textPath href={`#${id}-path`} startOffset="50%" textAnchor="middle">
          </textPath>
          <path id={`${id}-path`} d={path} fill="none" stroke="none" />
          {(() => {
            const fromC = getNodeCenter(from);
            const toC = getNodeCenter(to);
            const mx = (fromC.x + toC.x) / 2;
            const my = (fromC.y + toC.y) / 2;
            return (
              <g>
                <rect x={mx - edge.label.length * 3.5 - 4} y={my - 8} width={edge.label.length * 7 + 8} height={16} rx={4} fill="#18181b" stroke="#3f3f46" strokeWidth={0.5} />
                <text x={mx} y={my + 1} fontSize={9} fill="#a1a1aa" textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">{edge.label}</text>
              </g>
            );
          })()}
        </>
      )}
    </g>
  );
}

function DetailPanel({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  const colors = GROUP_COLORS[node.group];

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[380px] bg-zinc-900/95 backdrop-blur-xl border-l border-zinc-700 p-6 overflow-y-auto z-20"
      style={{ borderLeftColor: colors.glow + '40' }}>
      <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white text-lg">✕</button>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{node.icon}</span>
        <div>
          <h3 className="text-lg font-bold" style={{ color: colors.glow }}>{node.label}</h3>
          <span className="text-xs text-zinc-500 uppercase tracking-widest">{node.group}</span>
        </div>
      </div>

      <div className="space-y-4">
        {node.description && (
          <div>
            <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Description</h4>
            <p className="text-sm text-zinc-300 leading-relaxed">{node.description}</p>
          </div>
        )}

        {node.fnName && (
          <div>
            <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Function / Endpoint</h4>
            <code className="text-sm px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-emerald-400 block">{node.fnName}</code>
          </div>
        )}

        {node.file && (
          <div>
            <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Source File</h4>
            <code className="text-sm px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-cyan-400 block">src/{node.file}</code>
          </div>
        )}

        <div>
          <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Connections</h4>
          <div className="space-y-1">
            {EDGES.filter(e => e.from === node.id).map((e, i) => {
              const target = BASE_NODES.find((n: FlowNode) => n.id === e.to);
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <ArrowRight size={12} className="text-emerald-500" />
                  <span className="text-zinc-300">{target?.label}</span>
                  {e.label && <span className="text-xs text-zinc-600 ml-auto">{e.label}</span>}
                </div>
              );
            })}
            {EDGES.filter(e => e.to === node.id).map((e, i) => {
              const source = BASE_NODES.find((n: FlowNode) => n.id === e.from);
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <ArrowRight size={12} className="text-amber-500 rotate-180" />
                  <span className="text-zinc-300">{source?.label}</span>
                  {e.label && <span className="text-xs text-zinc-600 ml-auto">{e.label}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  Main Page
// ═══════════════════════════════════════════════════════

export default function FlowPage() {
  const [nodes, setNodes] = useState<FlowNode[]>(BASE_NODES);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch live data from API
  const fetchFlowData = useCallback(async () => {
    try {
      const res = await fetch('/api/flow');
      if (!res.ok) return;
      const data = await res.json();

      setNodes(prev => prev.map(node => {
        // Find matching API key for this node
        const apiKey = Object.entries(NODE_KEY_MAP).find(([, id]) => id === node.id)?.[0];
        if (apiKey && data.nodes[apiKey]?.subtitle) {
          return { ...node, sublabel: data.nodes[apiKey].subtitle };
        }
        return node;
      }));
      setLastUpdated(new Date());
    } catch {
      // silent fail
    }
  }, []);

  // Fetch on mount + every 10s
  useEffect(() => {
    void fetchFlowData();
    const interval = setInterval(() => void fetchFlowData(), 10_000);
    return () => clearInterval(interval);
  }, [fetchFlowData]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.4, Math.min(2, z - e.deltaY * 0.001)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const legendItems = [
    { label: 'Input', color: '#8b5cf6' },
    { label: 'Process', color: '#f59e0b' },
    { label: 'External API', color: '#ec4899' },
    { label: 'AI', color: '#ef4444' },
    { label: 'Storage', color: '#06b6d4' },
    { label: 'Output', color: '#22c55e' },
  ];

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-violet-400" />
          <h1 className="text-lg font-bold">Data Flow Pipeline</h1>
          <span className="flex items-center gap-1.5 text-xs text-zinc-500 px-2 py-0.5 bg-zinc-800 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {nodes.length} nodes · {EDGES.length} connections
            {lastUpdated && <span className="ml-1 text-zinc-600">· {lastUpdated.toLocaleTimeString()}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="flex items-center gap-3 mr-4">
            {legendItems.map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="text-xs text-zinc-500">{l.label}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowLabels(!showLabels)}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors" title="Toggle labels">
            {showLabels ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button onClick={resetView}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors" title="Reset view">
            <RefreshCw size={14} />
          </button>
          <span className="text-xs text-zinc-500 tabular-nums w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-zinc-950"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        {/* Grid Background */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        <svg
          width="100%"
          height="100%"
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#52525b" />
            </marker>
          </defs>

          {/* Edges (render behind nodes) */}
          {EDGES.map((edge, i) => (
            <EdgeLine key={i} edge={edge} nodes={nodes} />
          ))}

          {/* Nodes */}
          {nodes.map(node => (
            <NodeCard
              key={node.id}
              node={node}
              selected={selectedNode?.id === node.id}
              onClick={() => setSelectedNode(selectedNode?.id === node.id ? null : node)}
            />
          ))}
        </svg>

        {/* Detail Panel */}
        {selectedNode && (
          <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}

        {/* Zoom hint */}
        <div className="absolute bottom-4 left-4 text-xs text-zinc-600 select-none pointer-events-none">
          Scroll to zoom · Drag to pan · Click node for details
        </div>
      </div>
    </div>
  );
}
