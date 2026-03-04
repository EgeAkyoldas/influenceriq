'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Search, Filter, ChevronUp, ChevronDown,
  ExternalLink, ArrowUpDown
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAppStore } from '@/lib/store';

const clusterColors: Record<string, string> = {
  dating: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  mindset: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  relationships: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  masculinity: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const tierColors: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  B: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  C: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  D: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

interface ProfileRow {
  id: number;
  username: string;
  full_name: string;
  profile_pic_url: string;
  followers_count: number;
  primary_cluster: string | null;
  authority_score: number | null;
  engagement_rate: number | null;
  tier: string | null;
  monetization_signals: string[];
  is_verified: boolean;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function CandidatesPage() {
  const { filters, setFilter, resetFilters } = useAppStore();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.cluster) params.set('cluster', filters.cluster);
      if (filters.tier) params.set('tier', filters.tier);
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
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
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
                <SelectTrigger className="w-[160px] h-9">
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

              <Select
                value={filters.tier || 'all'}
                onValueChange={v => setFilter('tier', v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
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

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Candidate Pool</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
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
                      <TableHead className="w-[250px]">Profile</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('followers_count')}>
                        <span className="flex items-center">Followers <SortIcon col="followers_count" /></span>
                      </TableHead>
                      <TableHead>Cluster</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('authority_score')}>
                        <span className="flex items-center">Authority <SortIcon col="authority_score" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('engagement_rate')}>
                        <span className="flex items-center">Engagement <SortIcon col="engagement_rate" /></span>
                      </TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Monetization</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map(p => (
                      <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                              {p.profile_pic_url ? (
                                <img src={p.profile_pic_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm font-medium">{p.username[0]?.toUpperCase()}</span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium">@{p.username}</p>
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
                        <TableCell>
                          <span className="text-sm font-medium">{p.authority_score?.toFixed(1) || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{p.engagement_rate?.toFixed(2) || '—'}%</span>
                        </TableCell>
                        <TableCell>
                          {p.tier && (
                            <Badge variant="outline" className={`text-xs font-bold ${tierColors[p.tier] || ''}`}>
                              {p.tier}
                            </Badge>
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
                    ))}
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
                        variant="outline"
                        size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() => setFilter('page', pagination.page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
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
