'use client';

import { useEffect, useState, use, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Users, Heart, MessageCircle,
  Monitor, DollarSign, Globe, Target, TrendingUp,
  Flame, Drama, GitMerge, Swords, Zap, Crown, Layers, Mountain,
  Handshake, RefreshCw, BookOpen, HeartHandshake, Dumbbell, Sword,
  Anvil, TreePine, Brain, Info, Video, Tv2, FileText, Clapperboard, LayoutTemplate, Activity,
  XCircle, ClipboardEdit, CheckCircle2, RotateCcw, History, ScanSearch, ShieldCheck, ShieldAlert, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clusterColors, getCombo, tierMeta } from '@/lib/cluster-utils';

// ─── Lucide Icon Resolver ─────────────────────────────────────────────────────
const ICONS: Record<string, React.ElementType> = {
  Flame, Drama, GitMerge, Swords, Zap, Crown, Layers, Mountain,
  Handshake, RefreshCw, BookOpen, HeartHandshake, Dumbbell, Sword,
  Anvil, TreePine, Brain, Heart, Users, Video, Tv2, FileText, Clapperboard, LayoutTemplate, Activity, Monitor,
};

function ComboIcon({ name, size = 14 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Target;
  return <Icon size={size} />;
}

// ─── Types ────────────────────────────────────────────────────────────────────
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
  risk_flags: string[];
  audience_alignment: number;
  content_style: string;
  tier: string;
  tier_reason: string;
  content_summary: string;
  // DB stores is_approved as integer 0/1/null — never boolean
  is_approved: 0 | 1 | null;
  rejection_reason: string | null;
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

interface EditorDecision {
  id: number;
  username: string;
  previous_tier: string | null;
  new_tier: string;
  editor_reason: string;
  editor_note: string;
  created_at: string;
}


// ─── Content Style Badge ─────────────────────────────────────────────────────
const styleConfig: Record<string, { icon: React.ElementType; color: string }> = {
  'Face to camera':    { icon: Video,         color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  'POV approach':      { icon: Clapperboard,   color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  'Text overlay':      { icon: FileText,       color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  'Mixed':             { icon: LayoutTemplate, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  'Meme / aggregator': { icon: Tv2,            color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  'Lifestyle / vlog':  { icon: Activity,       color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  'Unknown':           { icon: Monitor,        color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
};

const styleDescriptions: Record<string, string> = {
  'Face to camera':    'Creator speaks directly to the camera — teaching, advising, or coaching. Required for S or A tier.',
  'POV approach':      'Cold approach / pickup content filmed from creator\'s first-person POV. Can qualify for S/A tier.',
  'Text overlay':      'Mostly motivational quotes or captions overlaid on images/clips. Caps tier at B.',
  'Mixed':             'Combination of face-to-camera and other formats (e.g., some coaching video + some text posts). Acceptable for A/B tier.',
  'Meme / aggregator': 'Primarily jokes, reposts, or relatable memes with no original coaching. Caps tier at C.',
  'Lifestyle / vlog':  'Day-in-the-life, travel, or gym lifestyle content — creator\'s life rather than coaching. Caps tier at C or D.',
  'Unknown':           'Could not determine content format from available captions.',
};

function ContentStyleBadge({ style }: { style: string }) {
  const cfg = styleConfig[style] ?? styleConfig['Unknown'];
  const Icon = cfg.icon;
  const description = styleDescriptions[style];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium cursor-help ${cfg.color}`}>
          <Icon size={14} />{style || 'Unknown'}
        </span>
      </TooltipTrigger>
      {description && (
        <TooltipContent side="top" className="max-w-60 p-3">
          <p className="text-xs text-zinc-200 leading-snug">{description}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

// ─── Tier Badge with Tooltip ──────────────────────────────────────────────────
function TierBadge({ tier, reason }: { tier: string; reason?: string }) {
  const meta = tierMeta[tier];
  if (!meta) return <span className="inline-flex items-center px-3 py-1 rounded-full border text-sm font-bold">{tier}</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-sm font-bold cursor-help ${meta.color}`}>
          Tier {tier}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72 space-y-2 p-3">
        <p className="font-semibold text-sm">{meta.label}</p>
        {/* AI tier_reason is primary — show it if available */}
        {reason ? (
          <div className="flex gap-1.5">
            <Info size={12} className="shrink-0 mt-0.5 text-blue-400" />
            <p className="text-xs text-zinc-300 leading-relaxed">{reason}</p>
          </div>
        ) : (
          // Fallback to static description only when AI hasn't run yet
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        )}
        {/* Static criteria always shown as reference */}
        <Separator className="my-1" />
        <ul className="text-xs text-zinc-400 space-y-0.5">
          {meta.criteria.map((c, i) => <li key={i}>• {c}</li>)}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Archetype Pill with Tooltip ──────────────────────────────────────────────
function ArchetypePill({ primary, secondary, size = 'md' }: {
  primary: string | null | undefined;
  secondary?: string | null;
  size?: 'sm' | 'md';
}) {
  const combo = getCombo(primary, secondary);
  if (!combo) return null;

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-sm';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border font-semibold cursor-help transition-opacity ${padding} ${combo.color}`}
        >
          <ComboIcon name={combo.icon} size={size === 'sm' ? 11 : 13} />
          {combo.tag}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-56 p-3">
        <p className="font-semibold text-sm mb-1">{combo.tag}</p>
        <p className="text-xs text-muted-foreground">{combo.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}


// ─── Page Component ───────────────────────────────────────────────────────────

export default function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorLogs, setEditorLogs] = useState<EditorDecision[]>([]);
  const [editorOverride, setEditorOverride] = useState<{ editor_tier: string | null; editor_note: string | null } | null>(null);
  const [editTier, setEditTier] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [reverifying, setReverifying] = useState(false);
  const [reverifyError, setReverifyError] = useState<string | null>(null);
  const [editApproval, setEditApproval] = useState<boolean | null>(null);
  const [editRejectionReason, setEditRejectionReason] = useState('');
  const [reverifyResult, setReverifyResult] = useState<{
    profile_id: number;
    old_analysis: {
      tier: string; relevance_score: number; authority_score: number; audience_alignment: number;
      primary_cluster: string; secondary_cluster: string | null; monetization_signals: string[];
      risk_flags: string[];
      is_approved: boolean; rejection_reason: string | null;
      content_style: string; content_summary: string; tier_reason: string;
    } | null;
    new_analysis: {
      tier: string; relevance_score: number; authority_score: number; audience_alignment: number;
      primary_cluster: string; secondary_cluster: string | null; monetization_signals: string[];
      risk_flags: string[];
      is_approved: boolean; rejection_reason: string | null;
      content_style: string; content_summary: string; tier_reason: string;
    };
    changed: boolean;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  // Lifted panel open states (prevents Turbopack HMR scope loss inside child component)
  const [reverifyOpen, setReverifyOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const fetchEditor = useCallback(() => {
    fetch(`/api/editor/${id}`)
      .then(r => r.json())
      .then((d: { override: { editor_tier: string | null; editor_note: string | null } | null; logs: EditorDecision[] }) => {
        setEditorOverride(d.override);
        setEditorLogs(d.logs || []);
        if (d.override?.editor_tier) setEditTier(d.override.editor_tier);
      })
      .catch(console.error);
  }, [id]);

  const handleSave = async () => {
    if (!editTier || !editReason.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/editor/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_tier: editTier,
          editor_reason: editReason,
          editor_note: editNote,
          ...(editApproval !== null ? { is_approved: editApproval, rejection_reason: editRejectionReason || null } : {}),
        }),
      });
      setSaveOk(true);
      setEditReason('');
      setEditNote('');
      setEditApproval(null);
      setEditRejectionReason('');
      fetchEditor();
      // Refresh profile to reflect any approval change
      const updated = await fetch(`/api/profiles/${id}`).then(r => r.json());
      setProfile(updated);
      setTimeout(() => setSaveOk(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    await fetch(`/api/editor/${id}`, { method: 'DELETE' });
    setEditorOverride(null);
    setEditTier(profile?.tier || '');
    fetchEditor();
  };

  const handleReverify = async () => {
    setReverifying(true);
    setReverifyResult(null);
    setReverifyError(null);
    setEditorOpen(false); // close editor when reverify starts
    try {
      const res = await fetch(`/api/profiles/${id}/reverify`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setReverifyResult(data);
        setReverifyOpen(true);
      } else {
        setReverifyError(data.error ?? 'Re-verify failed. Check server logs.');
        setReverifyOpen(true);
      }
    } catch (e) {
      console.error('Reverify failed:', e);
      setReverifyError(e instanceof Error ? e.message : 'Network error during re-verify.');
      setReverifyOpen(true);
    } finally {
      setReverifying(false);
    }
  };

  const handleApply = async () => {
    if (!reverifyResult) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/profiles/${id}/reverify/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reverifyResult.new_analysis),
      });
      if (res.ok) {
        // 1. Refresh profile → hero + cards update immediately
        const updated = await fetch(`/api/profiles/${id}`).then(r => r.json());
        setProfile(updated);
        setEditTier(updated.tier || '');
        // 2. Close panel immediately so exit animation starts
        setReverifyOpen(false);
        // 3. After animation finishes, clear state so useEffect doesn't re-open
        setTimeout(() => {
          setReverifyResult(null);
          setReverifyError(null);
        }, 400);
      } else {
        const d = await res.json();
        setReverifyError(d.error ?? 'Apply failed');
      }
    } catch (e) {
      setReverifyError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  };

  useEffect(() => {
    fetch(`/api/profiles/${id}`)
      .then(r => r.json())
      .then(data => {
        setProfile(data);
        setEditTier(data.tier || '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    fetchEditor();
  }, [id, fetchEditor]);

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

  const combo = getCombo(profile.primary_cluster, profile.secondary_cluster);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back Button */}
      <Link href="/candidates">
        <Button variant="ghost" size="sm" className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Candidates
        </Button>
      </Link>

      {/* Profile Hero Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="overflow-hidden">
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start gap-6 relative">
              {/* Approval status badge — top right */}
              {profile.is_approved !== null && (
                <div className="absolute top-0 right-0">
                  {profile.is_approved === 1 ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                      <ShieldCheck size={13} />
                      <span className="text-xs font-medium">Approved</span>
                    </div>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/30 text-destructive cursor-help">
                          <ShieldAlert size={13} />
                          <span className="text-xs font-medium">Rejected</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-64 p-3">
                        <p className="font-semibold text-sm text-destructive mb-1">Rejection Reason</p>
                        <p className="text-xs text-zinc-300">
                          {profile.rejection_reason
                            ? profile.rejection_reason
                            : <span className="italic text-zinc-500">No reason recorded — re-run AI analysis to populate.</span>}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
              {/* Avatar */}
              <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {profile.profile_pic_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.profile_pic_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold">{profile.username[0]?.toUpperCase()}</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 space-y-3">
                {/* Name row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold">@{profile.username}</h2>
                  {profile.is_verified && (
                    <Badge variant="secondary" className="text-xs">Verified</Badge>
                  )}
                  {(editorOverride?.editor_tier ?? profile.tier) && (
                    <TierBadge tier={(editorOverride?.editor_tier ?? profile.tier)!} reason={profile.tier_reason} />
                  )}
                  {combo && (
                    <ArchetypePill primary={profile.primary_cluster} secondary={profile.secondary_cluster} />
                  )}
                </div>

                {profile.full_name && <p className="text-muted-foreground">{profile.full_name}</p>}
                {profile.bio && <p className="text-sm max-w-lg">{profile.bio}</p>}

                {/* Stats */}
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
                  <a href={profile.website} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-primary flex items-center gap-1 hover:underline">
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className={`cursor-help ${clusterColors[profile.primary_cluster] || ''}`}>
                        {profile.primary_cluster}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-48 p-2">
                      <p className="text-xs">Primary classification cluster based on content niche and audience focus.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                {profile.secondary_cluster && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Secondary Cluster</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className={`cursor-help ${clusterColors[profile.secondary_cluster] || ''}`}>
                          {profile.secondary_cluster}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-48 p-2">
                        <p className="text-xs">Secondary audience cluster — content overlaps into this niche.</p>
                      </TooltipContent>
                    </Tooltip>
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

              {/* Risk Flags */}
              <div>
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-3 h-3" /> Risk Flags
                </p>
                {profile.risk_flags?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.risk_flags.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium bg-destructive/10 text-destructive border-destructive/25">
                        <XCircle className="w-3 h-3 shrink-0" />{f}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3" /> No risk flags detected
                  </p>
                )}
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                  <Monitor className="w-3 h-3" /> Content Style
                </p>
                <ContentStyleBadge style={profile.content_style} />
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

      {/* ─── Floating Editor Review Popup ─── */}
      {profile && <EditorFloatingPanel
        profileId={id}
        profileTier={profile.tier}
        editorOverride={editorOverride}
        editorLogs={editorLogs}
        editTier={editTier}
        setEditTier={setEditTier}
        editReason={editReason}
        setEditReason={setEditReason}
        editNote={editNote}
        setEditNote={setEditNote}
        saving={saving}
        saveOk={saveOk}
        onSave={handleSave}
        onClear={handleClear}
        editApproval={editApproval}
        setEditApproval={setEditApproval}
        editRejectionReason={editRejectionReason}
        setEditRejectionReason={setEditRejectionReason}
        reverifying={reverifying}
        reverifyResult={reverifyResult}
        applying={applying}
        onReverify={() => { setReverifyOpen(true); handleReverify(); }}
        onApply={handleApply}
        onClearReverify={() => { setReverifyResult(null); setReverifyError(null); setReverifyOpen(false); }}
        reverifyError={reverifyError}
        reverifyOpen={reverifyOpen}
        setReverifyOpen={setReverifyOpen}
        editorOpen={editorOpen}
        setEditorOpen={setEditorOpen}
      />}
    </div>
  );
}

// ─── Floating Editor Panel ────────────────────────────────────────────────────

function EditorFloatingPanel({
  editorOverride, editorLogs,
  editTier, setEditTier,
  editReason, setEditReason,
  editNote, setEditNote,
  saving, saveOk, onSave, onClear,
  editApproval, setEditApproval, editRejectionReason, setEditRejectionReason,
  reverifying, reverifyResult, reverifyError, applying, onReverify, onApply, onClearReverify,
  reverifyOpen, setReverifyOpen, editorOpen: open, setEditorOpen: setOpen,
}: {
  profileId: string;
  profileTier: string | null;
  editorOverride: { editor_tier: string | null; editor_note: string | null } | null;
  editorLogs: EditorDecision[];
  editTier: string; setEditTier: (v: string) => void;
  editReason: string; setEditReason: (v: string) => void;
  editNote: string; setEditNote: (v: string) => void;
  saving: boolean; saveOk: boolean;
  onSave: () => void; onClear: () => void;
  editApproval: boolean | null; setEditApproval: React.Dispatch<React.SetStateAction<boolean | null>>;
  editRejectionReason: string; setEditRejectionReason: (v: string) => void;
  reverifying: boolean;
  reverifyResult: {
    profile_id: number;
    old_analysis: {
      tier: string; relevance_score: number; authority_score: number; audience_alignment: number;
      primary_cluster: string; secondary_cluster: string | null; monetization_signals: string[];
      risk_flags: string[];
      is_approved: boolean; rejection_reason: string | null;
      content_style: string; content_summary: string; tier_reason: string;
    } | null;
    new_analysis: {
      tier: string; relevance_score: number; authority_score: number; audience_alignment: number;
      primary_cluster: string; secondary_cluster: string | null; monetization_signals: string[];
      risk_flags: string[];
      is_approved: boolean; rejection_reason: string | null;
      content_style: string; content_summary: string; tier_reason: string;
    };
    changed: boolean;
  } | null;
  applying: boolean;
  onReverify: () => void;
  onApply: () => void;
  onClearReverify: () => void;
  reverifyError: string | null;
  reverifyOpen: boolean; setReverifyOpen: (v: boolean) => void;
  editorOpen: boolean; setEditorOpen: (v: boolean) => void;
}) {
  const hasOverride = Boolean(editorOverride?.editor_tier);

  // reverifyOpen is now controlled by parent; auto-opened via onReverify prop wrapper

  return (
    <div className="fixed bottom-24 right-6 z-40 flex flex-col items-end gap-3">
      {/* ─── Reverify Panel ─── */}
      <AnimatePresence>
        {(reverifyOpen || reverifying) && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="w-[320px] bg-card border border-violet-500/25 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-violet-950/20">
              <div className="flex items-center gap-2">
                <ScanSearch className="w-3.5 h-3.5 text-violet-400" />
                <span className="font-semibold text-xs">AI Re-Verify</span>
                {reverifying && (
                  <span className="text-[10px] text-violet-400 animate-pulse">Analyzing...</span>
                )}
              </div>
              <button onClick={() => { setReverifyOpen(false); onClearReverify(); }} className="text-muted-foreground hover:text-foreground">
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3 space-y-2.5 text-sm max-h-[70vh] overflow-y-auto">
              {reverifying ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-7 h-7 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                  <p className="text-xs text-muted-foreground text-center">Running AI classification...</p>
                  <p className="text-[10px] text-muted-foreground/60 text-center">Checking follower count · bio signals · content style · monetization</p>
                </div>
              ) : reverifyError ? (
                <div className="flex flex-col gap-2 py-2">
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/15 border border-destructive/30">
                    <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-semibold text-destructive">Re-verify Failed</p>
                      <p className="text-[11px] text-zinc-300">{reverifyError}</p>
                    </div>
                  </div>
                </div>
              ) : reverifyResult ? (
                <div className="space-y-2">
                  {/* Header verdict */}
                  <div className={`flex items-center justify-between p-2.5 rounded-lg border ${
                    reverifyResult.changed ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
                  }`}>
                    <span className="text-[11px] font-semibold text-zinc-200">
                      {reverifyResult.changed ? '⚡ Changes detected' : '✓ No changes detected'}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs font-mono">
                      <span className="text-zinc-500">{reverifyResult.old_analysis?.tier ?? '?'}</span>
                      <span className="text-zinc-500">→</span>
                      <span className="font-bold text-white">Tier {reverifyResult.new_analysis.tier}</span>
                    </div>
                  </div>

                  {/* Approval status */}
                  <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${
                    reverifyResult.new_analysis.is_approved
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-destructive/15 text-destructive'
                  }`}>
                    {reverifyResult.new_analysis.is_approved ? (
                      <><ShieldCheck className="w-3.5 h-3.5" /> Approved for outreach</>
                    ) : (
                      <><ShieldAlert className="w-3.5 h-3.5" /> Rejected
                        {reverifyResult.new_analysis.rejection_reason && (
                          <span className="text-[10px] opacity-75 ml-1">— {reverifyResult.new_analysis.rejection_reason}</span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Field-by-field comparison table */}
                  <div className="rounded-lg border border-border/40 overflow-hidden">
                    <div className="px-2.5 py-1.5 bg-muted/30 border-b border-border/40">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Field Comparison</p>
                    </div>
                    {(() => {
                      const old = reverifyResult.old_analysis;
                      const next = reverifyResult.new_analysis;
                      const rows: Array<{ label: string; oldVal: string; newVal: string }> = [
                        { label: 'Cluster', oldVal: old?.primary_cluster ?? '?', newVal: next.primary_cluster },
                        { label: 'Content Style', oldVal: old?.content_style ?? '?', newVal: next.content_style },
                        { label: 'Relevance', oldVal: old?.relevance_score != null ? `${old.relevance_score}/100` : '?', newVal: `${next.relevance_score}/100` },
                        { label: 'Authority', oldVal: old?.authority_score != null ? `${old.authority_score}/10` : '?', newVal: `${next.authority_score}/10` },
                        { label: 'Audience Fit', oldVal: old?.audience_alignment != null ? `${old.audience_alignment}/100` : '?', newVal: `${next.audience_alignment}/100` },
                      ];
                      return rows.map(({ label, oldVal, newVal }) => {
                        const changed = oldVal !== newVal && oldVal !== '?';
                        return (
                          <div key={label} className={`flex items-center justify-between px-2.5 py-1.5 border-b border-border/20 last:border-0 ${
                            changed ? 'bg-amber-500/8' : ''
                          }`}>
                            <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
                            <div className="flex items-center gap-1.5 font-mono text-[10px]">
                              <span className={changed ? 'text-zinc-500 line-through' : 'text-muted-foreground'}>{oldVal}</span>
                              {changed && <>
                                <span className="text-zinc-600">→</span>
                                <span className="text-amber-400 font-semibold">{newVal}</span>
                              </>}
                              {!changed && oldVal !== '?' && <span className="text-zinc-600 text-[9px]">unchanged</span>}
                              {oldVal === '?' && <span className="text-foreground font-semibold">{newVal}</span>}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* AI Reasoning */}
                  {reverifyResult.new_analysis.tier_reason && (
                    <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 space-y-1">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">AI Reasoning</p>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">{reverifyResult.new_analysis.tier_reason}</p>
                    </div>
                  )}

                  {/* Content summary */}
                  {reverifyResult.new_analysis.content_summary && (
                    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30 space-y-1">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Content Summary</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">{reverifyResult.new_analysis.content_summary}</p>
                    </div>
                  )}

                  {/* Monetization */}
                  {reverifyResult.new_analysis.monetization_signals?.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-0.5">
                      {reverifyResult.new_analysis.monetization_signals.map((s, i) => (
                        <span key={i} className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">{s}</span>
                      ))}
                    </div>
                  )}

                  {/* Risk Flags */}
                  {reverifyResult.new_analysis.risk_flags?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-wider text-destructive/80 font-semibold">Risk Flags</p>
                      <div className="flex flex-wrap gap-1 px-0.5">
                        {reverifyResult.new_analysis.risk_flags.map((f, i) => (
                          <span key={i} className="text-[10px] bg-destructive/10 border border-destructive/25 text-destructive px-1.5 py-0.5 rounded">{f}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Apply / Dismiss */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={onApply}
                      disabled={applying}
                      className="flex-1 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                    >
                      {applying ? 'Applying...' : 'Apply Changes'}
                    </button>
                    <button
                      onClick={() => { setReverifyOpen(false); onClearReverify(); }}
                      className="flex-1 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-medium transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="w-[340px] bg-card border border-blue-500/20 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-blue-950/20">
              <div className="flex items-center gap-2">
                <ClipboardEdit className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-sm">Editor Review</span>
                {hasOverride && (
                  <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-300 px-1.5 py-0">
                    Override: Tier {editorOverride!.editor_tier}
                  </Badge>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <RotateCcw className="w-3.5 h-3.5 rotate-45" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">

              {/* Tier selector + revert */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Set Tier</span>
                <Select value={editTier} onValueChange={setEditTier}>
                  <SelectTrigger className="h-8 w-28 text-sm">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {['S', 'A', 'B', 'C', 'D'].map(t => (
                      <SelectItem key={t} value={t}>Tier {t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasOverride && (
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground ml-auto" onClick={onClear}>
                    <RotateCcw className="w-3 h-3" /> Revert
                  </Button>
                )}
              </div>

              {/* Reason */}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Reason <span className="text-destructive">*</span></span>
                <Textarea
                  placeholder="Why this tier? e.g. Face-to-camera, clear DM funnel..."
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  className="text-sm min-h-[60px] resize-none"
                />
              </div>

              {/* Note */}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Note <span className="text-xs opacity-50">(optional)</span></span>
                <Textarea
                  placeholder="Internal notes or follow-up..."
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  className="text-sm min-h-[44px] resize-none"
                />
              </div>

              {/* Approve / Reject toggle */}
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground">Approval Decision <span className="text-xs opacity-50">(optional)</span></span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditApproval(v => v === true ? null : true)}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border text-xs font-medium transition-colors ${
                      editApproval === true
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'border-border text-muted-foreground hover:text-emerald-400 hover:border-emerald-500/30'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => setEditApproval(v => v === false ? null : false)}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border text-xs font-medium transition-colors ${
                      editApproval === false
                        ? 'bg-destructive/20 border-destructive/50 text-destructive'
                        : 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/30'
                    }`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
                {editApproval === false && (
                  <Textarea
                    placeholder="Rejection reason (e.g. Too many followers, fitness niche)..."
                    value={editRejectionReason}
                    onChange={e => setEditRejectionReason(e.target.value)}
                    className="text-sm min-h-[44px] resize-none border-destructive/30"
                  />
                )}
              </div>

              <Button
                className="w-full gap-2 h-9"
                onClick={onSave}
                disabled={saving || !editTier || !editReason.trim()}
              >
                {saveOk ? (
                  <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                ) : saving ? 'Saving...' : (
                  <><ClipboardEdit className="w-4 h-4" /> Save Decision</>
                )}
              </Button>

              {/* Decision History */}
              {editorLogs.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <History className="w-3 h-3" /> Decision History
                    </p>
                    <div className="space-y-1.5">
                      {editorLogs.map(log => (
                        <div key={log.id} className="text-xs p-2 rounded-lg bg-muted/40 border border-border/40 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground">{log.previous_tier ?? '?'} → {log.new_tier}</span>
                            <span className="text-muted-foreground/50 ml-auto">{new Date(log.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-zinc-300 leading-snug">{log.editor_reason}</p>
                          {log.editor_note && <p className="text-muted-foreground italic">{log.editor_note}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sparkles FAB — AI Re-Verify */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => {
          if (reverifyOpen && !reverifying) {
            setReverifyOpen(false);
            onClearReverify();
          } else {
            setReverifyOpen(true);
            onReverify();
          }
        }}
        disabled={reverifying}
        className={`relative w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors disabled:opacity-60 ${
          reverifyOpen || reverifyResult
            ? 'bg-violet-600 text-white'
            : 'bg-card border border-violet-500/40 text-violet-400 hover:bg-violet-500/10'
        }`}
      >
        <ScanSearch className="w-5 h-5" />
        {reverifyResult && !reverifyOpen && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-violet-400 border-2 border-background" />
        )}
      </motion.button>

      {/* Editor FAB — ClipboardEdit */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            setOpen(true);
            setReverifyOpen(false);
          }
        }}
        className={`relative w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${
          open
            ? 'bg-blue-600 text-white'
            : 'bg-card border border-blue-500/40 text-blue-400 hover:bg-blue-500/10'
        }`}
      >
        <ClipboardEdit className="w-5 h-5" />
        {hasOverride && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-400 border-2 border-background" />
        )}
      </motion.button>
    </div>
  );
}



function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const safe = value ?? 0;
  const pct = (safe / max) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">{safe.toFixed(1)}/{max}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
