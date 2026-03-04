'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Search, Upload, Loader2, TrendingUp,
  Target, Zap, BarChart3, ArrowRight, CheckCircle2, AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/lib/store';
import Link from 'next/link';

const clusterColors: Record<string, string> = {
  dating: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  mindset: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  relationships: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  masculinity: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

export default function DashboardPage() {
  const { dashboardStats, setDashboardStats, researches, setResearches, isSubmitting, setSubmitting } = useAppStore();
  const [seedInput, setSeedInput] = useState('');
  const [seedType, setSeedType] = useState<'username' | 'csv'>('username');
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const [dashRes, researchRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/research'),
      ]);
      const dashData = await dashRes.json();
      const researchData = await researchRes.json();
      setDashboardStats(dashData);
      setResearches(researchData);
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [setDashboardStats, setResearches]);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 5000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const handleStartResearch = async () => {
    if (!seedInput.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed_type: seedType,
          seed_value: seedInput.trim(),
        }),
      });
      setSeedInput('');
      fetchDashboard();
    } catch (e) {
      console.error('Research start error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const stats = dashboardStats?.stats;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatsCard
              title="Total Profiles"
              value={stats?.totalProfiles || 0}
              icon={Users}
              delay={0}
            />
            <StatsCard
              title="Analyzed"
              value={stats?.analyzedProfiles || 0}
              icon={Target}
              delay={0.1}
            />
            <StatsCard
              title="Active Research"
              value={stats?.activeResearch || 0}
              icon={Zap}
              delay={0.2}
            />
            <StatsCard
              title="Top Tier (A)"
              value={dashboardStats?.tierDistribution?.find(t => t.tier === 'A')?.count || 0}
              icon={TrendingUp}
              delay={0.3}
            />
          </>
        )}
      </div>

      {/* Research Input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Start New Research
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={seedType === 'username' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSeedType('username')}
              >
                <Users className="w-4 h-4 mr-1" />
                Usernames
              </Button>
              <Button
                variant={seedType === 'csv' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSeedType('csv')}
              >
                <Upload className="w-4 h-4 mr-1" />
                CSV Paste
              </Button>
            </div>

            {seedType === 'username' ? (
              <Input
                placeholder="Enter Instagram usernames separated by commas (e.g., hamloaf, tatespeech)"
                value={seedInput}
                onChange={e => setSeedInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStartResearch()}
              />
            ) : (
              <Textarea
                placeholder="Paste a list of usernames, one per line or comma-separated..."
                value={seedInput}
                onChange={e => setSeedInput(e.target.value)}
                rows={5}
              />
            )}

            <Button
              onClick={handleStartResearch}
              disabled={isSubmitting || !seedInput.trim()}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Start Research
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Research */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Research</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
              ) : researches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No research yet. Start one above!</p>
              ) : (
                researches.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                    <div className="space-y-1">
                      <p className="text-sm font-medium truncate max-w-[200px]">
                        {r.seed_value.substring(0, 40)}{r.seed_value.length > 40 ? '...' : ''}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {r.seed_type}
                        </Badge>
                        <span>{r.profiles_found} found · {r.profiles_analyzed} analyzed</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      {r.status === 'complete' && (
                        <Link href="/candidates">
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Cluster Distribution */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Cluster Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)
              ) : !dashboardStats?.clusterDistribution?.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
              ) : (
                dashboardStats.clusterDistribution.map(c => {
                  const total = dashboardStats.clusterDistribution.reduce((sum, x) => sum + x.count, 0);
                  const pct = total > 0 ? (c.count / total) * 100 : 0;
                  return (
                    <div key={c.cluster} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={clusterColors[c.cluster] || ''}>
                          {c.cluster}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{c.count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Top Profiles */}
      {dashboardStats?.topProfiles && dashboardStats.topProfiles.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Top Performers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {dashboardStats.topProfiles.map((p, i) => (
                  <div
                    key={p.username}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50"
                  >
                    <div className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">@{p.username}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className={`text-[10px] px-1 py-0 ${clusterColors[p.primary_cluster] || ''}`}>
                          {p.primary_cluster}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{p.authority_score.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, delay }: { title: string; value: number; icon: React.ElementType; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-6 h-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; icon: React.ElementType }> = {
    pending: { className: 'bg-zinc-500/15 text-zinc-400', icon: Loader2 },
    fetching: { className: 'bg-blue-500/15 text-blue-400', icon: Loader2 },
    analyzing: { className: 'bg-amber-500/15 text-amber-400', icon: Loader2 },
    complete: { className: 'bg-emerald-500/15 text-emerald-400', icon: CheckCircle2 },
    failed: { className: 'bg-red-500/15 text-red-400', icon: AlertCircle },
  };
  const c = config[status] || config.pending;
  const IconComp = c.icon;
  return (
    <Badge variant="outline" className={`${c.className} text-xs`}>
      <IconComp className={`w-3 h-3 mr-1 ${['pending', 'fetching', 'analyzing'].includes(status) ? 'animate-spin' : ''}`} />
      {status}
    </Badge>
  );
}
