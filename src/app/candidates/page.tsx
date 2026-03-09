'use client';
import React from 'react';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import type { LucideProps } from 'lucide-react';
import {
  Search, Filter, ChevronUp, ChevronDown, ExternalLink, ArrowUpDown,
  Flame, Drama, GitMerge, Swords, Zap, Crown, Layers, Mountain,
  Handshake, RefreshCw, BookOpen, HeartHandshake, Dumbbell, Sword, Anvil, TreePine,
  BarChart2, LayoutList,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAppStore } from '@/lib/store';
import { clusterColors, getCombo, getAllCombos } from '@/lib/cluster-utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

// ─── Icon Resolver ────────────────────────────────────────────────────────────
const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  Flame, Drama, GitMerge, Swords, Zap, Crown, Layers, Mountain,
  Handshake, RefreshCw, BookOpen, HeartHandshake, Dumbbell, Sword, Anvil, TreePine,
};
function ComboIcon({ name }: { name: string }) {
  const Icon = ICONS[name] ?? Filter;
  return <Icon size={12} />;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const tierColors: Record<string, string> = {
  S: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]',
  A: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  B: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  C: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  D: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProfileRow {
  id: number;
  username: string;
  full_name: string;
  profile_pic_url: string;
  followers_count: number;
  primary_cluster: string | null;
  secondary_cluster: string | null;
  authority_score: number | null;
  engagement_rate: number | null;
  tier: string | null;
  monetization_signals: string[];
  is_verified: boolean;
  is_approved: number | null;  // 0 = rejected, 1 = approved, null = not analyzed
  rejection_reason: string | null;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface AnalyticsData {
  tiers:     { tier: string; count: number }[];
  clusters:  { cluster: string; count: number }[];
  combos:    { primary_cluster: string; secondary_cluster: string; count: number }[];
  followers: { bucket: string; count: number }[];
  authority: { bucket: string; count: number }[];
  matrix:    { tier: string; cluster: string; count: number }[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CandidatesPage() {
  const { filters, setFilter, resetFilters } = useAppStore();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'analytics'>('table');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.cluster) params.set('cluster', filters.cluster);
      if (filters.tier) params.set('tier', filters.tier);
      if (filters.archetype) params.set('archetype', filters.archetype);
      if (filters.search) params.set('search', filters.search);
      params.set('sortBy', filters.sortBy);
      params.set('sortOrder', filters.sortOrder);
      params.set('page', String(filters.page));
      params.set('limit', '25');

      const res = await fetch(`/api/profiles?${params}`);
      const data = await res.json();
      setProfiles(data.data || []);
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 });
    } catch (e) {
      console.error('Profiles fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const fetchAnalytics = useCallback(async () => {
    if (analytics) return; // already loaded
    setAnalyticsLoading(true);
    try {
      const res = await fetch('/api/analytics');
      setAnalytics(await res.json());
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analytics]);

  useEffect(() => {
    if (view === 'analytics') fetchAnalytics();
  }, [view, fetchAnalytics]);

  const handleSort = (col: string) => {
    if (filters.sortBy === col) {
      setFilter('sortOrder', filters.sortOrder === 'DESC' ? 'ASC' : 'DESC');
    } else {
      setFilter('sortBy', col);
      setFilter('sortOrder', 'DESC');
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (filters.sortBy !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return filters.sortOrder === 'DESC'
      ? <ChevronDown className="w-3 h-3 ml-1" />
      : <ChevronUp className="w-3 h-3 ml-1" />;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px]">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by username or name..."
                  value={filters.search}
                  onChange={e => setFilter('search', e.target.value)}
                  className="h-9"
                />
              </div>

              <Select
                value={filters.cluster || 'all'}
                onValueChange={v => setFilter('cluster', v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-[130px] sm:w-[160px] h-9">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Cluster" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clusters</SelectItem>
                  <SelectItem value="dating">Dating</SelectItem>
                  <SelectItem value="mindset">Mindset</SelectItem>
                  <SelectItem value="relationships">Relationships</SelectItem>
                  <SelectItem value="masculinity">Masculinity</SelectItem>
                </SelectContent>
              </Select>

              {/* Archetype filter — custom popover with icons */}
              {(() => {
                const allCombos = getAllCombos();
                const active = allCombos.find(c => c.tag === filters.archetype);
                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={`h-9 gap-2 min-w-[140px] sm:min-w-[180px] justify-start font-normal ${
                        active ? active.color : 'text-muted-foreground'
                      }`}>
                        {active ? (
                          <><ComboIcon name={active.icon} /> {active.tag}</>
                        ) : (
                          <><Filter className="w-3 h-3" /> All Archetypes</>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-1 max-h-72 overflow-y-auto" align="start">
                      <button
                        className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-muted-foreground"
                        onClick={() => setFilter('archetype', null)}
                      >
                        All Archetypes
                      </button>
                      {allCombos.map(c => (
                        <button
                          key={c.key}
                          className={`group w-full text-left px-3 py-2 text-sm rounded-md flex items-center gap-2 transition-colors
                            hover:bg-muted ${filters.archetype === c.tag ? c.color + ' font-semibold' : 'text-foreground'}`}
                          onClick={() => setFilter('archetype', c.tag)}
                        >
                          <span className={`transition-colors ${filters.archetype === c.tag ? '' : 'text-muted-foreground group-hover:' + c.color.split(' ').find(x => x.startsWith('text-'))}`}>
                            <ComboIcon name={c.icon} />
                          </span>
                          {c.tag}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                );
              })()}

              <Select
                value={filters.tier || 'all'}
                onValueChange={v => setFilter('tier', v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-[100px] sm:w-[120px] h-9">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="S">Tier S</SelectItem>
                  <SelectItem value="A">Tier A</SelectItem>
                  <SelectItem value="B">Tier B</SelectItem>
                  <SelectItem value="C">Tier C</SelectItem>
                  <SelectItem value="D">Tier D</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Reset
              </Button>

              <span className="text-sm text-muted-foreground ml-auto">
                {pagination.total} profiles
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Table / Analytics Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader className="pb-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <CardTitle className="text-base">Candidate Pool</CardTitle>
            {/* View toggle */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              <button
                onClick={() => setView('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all font-medium ${
                  view === 'table' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" /> Table
              </button>
              <button
                onClick={() => setView('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all font-medium ${
                  view === 'analytics' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" /> Analytics
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {view === 'analytics' ? (
              <AnalyticsPanel data={analytics} loading={analyticsLoading} />
            ) : loading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : profiles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg">No profiles found</p>
                <p className="text-sm mt-1">Start a research from the Dashboard to discover influencers</p>
              </div>
            ) : (
              <>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[220px]">Profile</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('followers_count')}>
                        <span className="flex items-center">Followers <SortIcon col="followers_count" /></span>
                      </TableHead>
                      <TableHead>Cluster</TableHead>
                      {/* Archetype column — sortable by combo tag */}
                      <TableHead className="cursor-pointer" onClick={() => handleSort('primary_cluster')}>
                        <span className="flex items-center">Archetype <SortIcon col="primary_cluster" /></span>
                      </TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('is_approved')}>
                        <span className="flex items-center">Status <SortIcon col="is_approved" /></span>
                      </TableHead>
                      <TableHead>Monetization</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map(p => {
                      const combo = getCombo(p.primary_cluster, p.secondary_cluster);
                      return (
                        <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden relative">
                                {p.profile_pic_url && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={p.profile_pic_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      target.style.display = 'none';
                                      const fallback = target.nextElementSibling as HTMLElement;
                                      if (fallback) fallback.style.display = 'flex';
                                    }}
                                  />
                                )}
                                <span
                                  className="text-sm font-medium flex items-center justify-center w-full h-full"
                                  style={{ display: p.profile_pic_url ? 'none' : 'flex' }}
                                >
                                  {p.username[0]?.toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium">@{p.username}</p>
                                  {p.is_approved && (
                                    <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                    </svg>
                                  )}
                                </div>
                                {p.full_name && <p className="text-xs text-muted-foreground">{p.full_name}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{(p.followers_count || 0).toLocaleString()}</TableCell>
                          <TableCell>
                            {p.primary_cluster && (
                              <Badge variant="outline" className={`text-xs ${clusterColors[p.primary_cluster] || ''}`}>
                                {p.primary_cluster}
                              </Badge>
                            )}
                          </TableCell>
                          {/* ── Archetype icon pill with tooltip ── */}
                          <TableCell>
                            {combo ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border cursor-help transition-opacity hover:opacity-80 ${combo.color}`}>
                                    <ComboIcon name={combo.icon} />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-52 p-3 space-y-1">
                                  <p className="font-semibold text-sm">{combo.tag}</p>
                                  <p className="text-xs text-muted-foreground">{combo.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.tier && (
                              <Badge variant="outline" className={`text-xs font-bold ${tierColors[p.tier] || ''}`}>
                                {p.tier}
                              </Badge>
                            )}
                          </TableCell>
                          {/* Approval Status — icon only */}
                          <TableCell>
                            {p.is_approved === null ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : p.is_approved === 1 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 cursor-default">
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="left"><p className="text-xs">Approved</p></TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-destructive/15 text-destructive cursor-help">
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-52 p-2 space-y-1">
                                  <p className="text-xs font-semibold text-destructive">Rejected</p>
                                  {p.rejection_reason && <p className="text-xs text-zinc-300">{p.rejection_reason}</p>}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(p.monetization_signals || []).slice(0, 2).map((s, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {s}
                                </Badge>
                              ))}
                              {(p.monetization_signals || []).length > 2 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  +{(p.monetization_signals || []).length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Link href={`/candidates/${p.id}`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <span className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline" size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() => setFilter('page', pagination.page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => setFilter('page', pagination.page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── Analytics Panel ──────────────────────────────────────────────────────────
const TIER_COLORS: Record<string, string> = {
  S: '#eab308', A: '#34d399', B: '#60a5fa', C: '#fbbf24', D: '#a1a1aa',
};
const CLUSTER_COLORS: Record<string, string> = {
  dating: '#f43f5e', mindset: '#60a5fa', relationships: '#f59e0b', masculinity: '#10b981',
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted/20 rounded-xl border border-border/50 p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">{title}</p>
      {children}
    </div>
  );
}

const CustomBar = ({ x, y, width, height, fill }: { x?: number; y?: number; width?: number; height?: number; fill?: string }) => (
  <g>
    <rect x={x} y={y} rx={4} ry={4} width={width} height={height} fill={fill} fillOpacity={0.9} />
  </g>
);

function AnalyticsPanel({ data, loading }: { data: AnalyticsData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-muted/20 rounded-xl border border-border/50 p-4 h-64">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-48 w-full" />
          </div>
        ))}
      </div>
    );
  }

  // Safe arrays — guard against partial API responses
  const safeTiers     = data.tiers     ?? [];
  const safeClusters  = data.clusters  ?? [];
  const safeCombos    = data.combos    ?? [];
  const safeFollowers = data.followers ?? [];
  const safeAuthority = data.authority ?? [];
  const safeMatrix    = data.matrix    ?? [];

  // Build archetype labels for combos
  const comboData = safeCombos.map(c => {
    const combo = getCombo(c.primary_cluster, c.secondary_cluster || undefined);
    return { name: combo?.tag ?? `${c.primary_cluster}`, count: c.count, primary: c.primary_cluster };
  }).slice(0, 10);

  // Stacked bar: tier × cluster — pivot clusters as stacks
  const clusterKeys = ['dating', 'mindset', 'relationships', 'masculinity'];
  const matrixByTier: Record<string, Record<string, number>> = {};
  ['S', 'A', 'B', 'C', 'D'].forEach(t => { matrixByTier[t] = {}; });
  safeMatrix.forEach(row => {
    if (matrixByTier[row.tier]) matrixByTier[row.tier][row.cluster] = row.count;
  });
  const matrixData = ['S', 'A', 'B', 'C', 'D'].map(tier => ({
    tier,
    ...matrixByTier[tier],
  }));

  const axisStyle = { fill: '#71717a', fontSize: 11 };
  const gridStyle = { stroke: 'rgba(255,255,255,0.05)' };
  const tooltipStyle = {
    contentStyle: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 },
    labelStyle: { color: '#e4e4e7', fontWeight: 600 },
    itemStyle: { color: '#a1a1aa' },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 py-2">

      {/* 1 — Tier Donut */}
      <ChartCard title="Tier Distribution">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={safeTiers}
              dataKey="count"
              nameKey="tier"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={(entry: any) => `${entry.name ?? entry.tier} · ${entry.value ?? entry.count}`}
              labelLine={false}
            >
              {safeTiers.map((row) => (
                <Cell key={row.tier} fill={TIER_COLORS[row.tier] ?? '#71717a'} />
              ))}
            </Pie>
            <Legend formatter={(v) => `Tier ${v}`} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
            <RechartTooltip {...tooltipStyle} formatter={(v, n) => [v, `Tier ${n}`]} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 2 — Cluster Bar */}
      <ChartCard title="Cluster Distribution">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={safeClusters} layout="vertical" barCategoryGap="25%">
            <CartesianGrid horizontal={false} {...gridStyle} />
            <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="cluster" tick={axisStyle} axisLine={false} tickLine={false} width={90} />
            <RechartTooltip {...tooltipStyle} />
            <Bar dataKey="count" shape={<CustomBar />} radius={[0, 4, 4, 0]}>
              {safeClusters.map((row) => (
                <Cell key={row.cluster} fill={CLUSTER_COLORS[row.cluster] ?? '#60a5fa'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 3 — Top Archetypes */}
      <ChartCard title="Top Archetypes">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={comboData} layout="vertical" barCategoryGap="20%">
            <CartesianGrid horizontal={false} {...gridStyle} />
            <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ ...axisStyle, fontSize: 10 }} axisLine={false} tickLine={false} width={105} />
            <RechartTooltip {...tooltipStyle} />
            <Bar dataKey="count" shape={<CustomBar />}>
              {comboData.map((row) => (
                <Cell key={row.name} fill={CLUSTER_COLORS[row.primary] ?? '#60a5fa'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 4 — Follower Buckets */}
      <ChartCard title="Follower Count Distribution">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={safeFollowers} barCategoryGap="30%">
            <CartesianGrid vertical={false} {...gridStyle} />
            <XAxis dataKey="bucket" tick={{ ...axisStyle, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
            <RechartTooltip {...tooltipStyle} />
            <Bar dataKey="count" fill="#818cf8" shape={<CustomBar />} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 5 — Authority Score Distribution */}
      <ChartCard title="Authority Score Distribution">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={safeAuthority} barCategoryGap="30%">
            <CartesianGrid vertical={false} {...gridStyle} />
            <XAxis dataKey="bucket" tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
            <RechartTooltip {...tooltipStyle} />
            <Bar dataKey="count" fill="#34d399" shape={<CustomBar />} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 6 — Tier × Cluster Stacked */}
      <ChartCard title="Tier × Cluster Breakdown">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={matrixData} barCategoryGap="30%">
            <CartesianGrid vertical={false} {...gridStyle} />
            <XAxis dataKey="tier" tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
            <RechartTooltip {...tooltipStyle} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
            {clusterKeys.map(c => (
              <Bar key={c} dataKey={c} stackId="a" fill={CLUSTER_COLORS[c]} name={c} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

    </div>
  );
}
