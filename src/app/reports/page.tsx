'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, BarChart3, Users, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

interface DashboardData {
  stats: {
    totalProfiles: number;
    analyzedProfiles: number;
  };
  clusterDistribution: Array<{ cluster: string; count: number }>;
  tierDistribution: Array<{ tier: string; count: number }>;
  topProfiles: Array<{
    username: string;
    followers_count: number;
    authority_score: number;
    primary_cluster: string;
    tier: string;
  }>;
}

import { clusterColors } from '@/lib/cluster-utils';

const tierColors: Record<string, string> = {
  A: 'text-emerald-400',
  B: 'text-blue-400',
  C: 'text-amber-400',
  D: 'text-zinc-400',
};

export default function ReportsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-xl" />)}
      </div>
    );
  }

  const totalAnalyzed = data?.stats?.analyzedProfiles || 0;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Analysis Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-3xl font-bold">{data?.stats?.totalProfiles || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Profiles</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-3xl font-bold">{totalAnalyzed}</p>
                <p className="text-xs text-muted-foreground mt-1">Analyzed</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-3xl font-bold">
                  {data?.tierDistribution?.find(t => t.tier === 'A')?.count || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Tier A</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-3xl font-bold">{data?.clusterDistribution?.length || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Active Clusters</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cluster Breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Cluster Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data?.clusterDistribution?.length ? (
                data.clusterDistribution.map(c => {
                  const pct = totalAnalyzed > 0 ? (c.count / totalAnalyzed) * 100 : 0;
                  return (
                    <div key={c.cluster} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={clusterColors[c.cluster] || ''}>
                          {c.cluster}
                        </Badge>
                        <span className="text-sm font-medium">{c.count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <Progress value={pct} className="h-3" />
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No cluster data yet</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Tier Breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" /> Tier Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data?.tierDistribution?.length ? (
                data.tierDistribution.map(t => {
                  const pct = totalAnalyzed > 0 ? (t.count / totalAnalyzed) * 100 : 0;
                  return (
                    <div key={t.tier} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${tierColors[t.tier] || ''}`}>
                          Tier {t.tier}
                        </span>
                        <span className="text-sm">{t.count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <Progress value={pct} className="h-3" />
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No tier data yet</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Leaderboard */}
      {data?.topProfiles && data.topProfiles.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4" /> Leaderboard — Top Influencers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.topProfiles.map((p, i) => (
                  <div
                    key={p.username}
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border border-border/50"
                  >
                    <span className="text-2xl font-bold text-muted-foreground w-8 text-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">@{p.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.followers_count.toLocaleString()} followers
                      </p>
                    </div>
                    <Badge variant="outline" className={clusterColors[p.primary_cluster] || ''}>
                      {p.primary_cluster}
                    </Badge>
                    <div className="text-right">
                      <p className="text-lg font-bold">{p.authority_score.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">authority</p>
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
