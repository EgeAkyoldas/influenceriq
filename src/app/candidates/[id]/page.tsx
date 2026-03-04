'use client';

import { useEffect, useState, use } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Users, Heart, MessageCircle, Shield,
  AlertTriangle, DollarSign, Globe, Target, TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

const clusterColors: Record<string, string> = {
  dating: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  mindset: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  relationships: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  masculinity: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const tierColors: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-400',
  B: 'bg-blue-500/15 text-blue-400',
  C: 'bg-amber-500/15 text-amber-400',
  D: 'bg-zinc-500/15 text-zinc-400',
};

interface ProfileDetail {
  id: number;
  username: string;
  full_name: string;
  bio: string;
  followers_count: number;
  following_count: number;
  media_count: number;
  profile_pic_url: string;
  website: string;
  is_verified: boolean;
  primary_cluster: string;
  secondary_cluster: string | null;
  relevance_score: number;
  authority_score: number;
  engagement_rate: number;
  monetization_signals: string[];
  audience_alignment: number;
  risk_flags: string[];
  tier: string;
  content_summary: string;
  media: Array<{
    id: number;
    caption: string;
    like_count: number;
    comments_count: number;
    media_type: string;
    permalink: string;
    timestamp: string;
  }>;
}

export default function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/profiles/${id}`)
      .then(r => r.json())
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-60 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <p className="text-lg text-muted-foreground">Profile not found</p>
        <Link href="/candidates"><Button variant="outline" className="mt-4">Back to Candidates</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back Button */}
      <Link href="/candidates">
        <Button variant="ghost" size="sm" className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Candidates
        </Button>
      </Link>

      {/* Profile Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {profile.profile_pic_url ? (
                  <img src={profile.profile_pic_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold">{profile.username[0]?.toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold">@{profile.username}</h2>
                  {profile.is_verified && (
                    <Badge variant="secondary" className="text-xs">Verified</Badge>
                  )}
                  {profile.tier && (
                    <Badge className={`text-sm font-bold ${tierColors[profile.tier] || ''}`}>
                      Tier {profile.tier}
                    </Badge>
                  )}
                </div>
                {profile.full_name && (
                  <p className="text-muted-foreground">{profile.full_name}</p>
                )}
                {profile.bio && (
                  <p className="text-sm max-w-lg">{profile.bio}</p>
                )}
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{profile.followers_count.toLocaleString()}</span>
                    <span className="text-muted-foreground">followers</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{profile.following_count.toLocaleString()}</span>
                    <span className="text-muted-foreground">following</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{profile.media_count.toLocaleString()}</span>
                    <span className="text-muted-foreground">posts</span>
                  </div>
                </div>
                {profile.website && (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary flex items-center gap-1 hover:underline"
                  >
                    <Globe className="w-3 h-3" /> {profile.website}
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Classification */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4" />
                AI Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Primary Cluster</span>
                  <Badge variant="outline" className={clusterColors[profile.primary_cluster] || ''}>
                    {profile.primary_cluster}
                  </Badge>
                </div>
                {profile.secondary_cluster && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Secondary Cluster</span>
                    <Badge variant="outline" className={clusterColors[profile.secondary_cluster] || ''}>
                      {profile.secondary_cluster}
                    </Badge>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <ScoreBar label="Authority Score" value={profile.authority_score} max={10} />
                <ScoreBar label="Relevance" value={profile.relevance_score} max={100} />
                <ScoreBar label="Audience Alignment" value={profile.audience_alignment} max={100} />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Engagement Rate</span>
                  <span className="text-sm font-medium">{profile.engagement_rate?.toFixed(2)}%</span>
                </div>
              </div>

              {profile.content_summary && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Content Summary</p>
                    <p className="text-sm">{profile.content_summary}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Monetization & Risks */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Monetization & Risks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Monetization Signals</p>
                {profile.monetization_signals?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.monetization_signals.map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        <TrendingUp className="w-3 h-3 mr-1" /> {s}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No monetization signals detected</p>
                )}
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Risk Flags
                </p>
                {profile.risk_flags?.length > 0 ? (
                  <div className="space-y-2">
                    {profile.risk_flags.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-destructive/10 text-destructive">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-emerald-400">No risk flags detected ✓</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Media */}
      {profile.media?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Content ({profile.media.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {profile.media.map((m) => (
                  <div key={m.id} className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-2">
                    <p className="text-sm line-clamp-3">{m.caption || <span className="text-muted-foreground italic">No caption</span>}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" /> {(m.like_count || 0).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" /> {(m.comments_count || 0).toLocaleString()}
                      </span>
                      <span>{m.media_type}</span>
                      {m.permalink && (
                        <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-auto">
                          View on IG
                        </a>
                      )}
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

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">{value.toFixed(1)}/{max}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
