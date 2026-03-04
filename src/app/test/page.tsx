'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Copy, Check, Eye, EyeOff, Shield, Image as ImageIcon, User, BarChart3,
  ExternalLink, RefreshCw
} from 'lucide-react';

interface FieldCategory {
  label: string;
  fields: string[];
}

const DEFAULT_PROFILE_FIELDS = ['id', 'username', 'name', 'biography', 'followers_count', 'follows_count', 'media_count', 'profile_picture_url', 'website', 'ig_id'];
const DEFAULT_MEDIA_FIELDS = ['id', 'media_type', 'media_url', 'thumbnail_url', 'caption', 'like_count', 'comments_count', 'timestamp', 'permalink', 'media_product_type'];

export default function TestPage() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [mediaLimit, setMediaLimit] = useState(25);

  // Field toggles
  const [profileFields, setProfileFields] = useState<Set<string>>(new Set(DEFAULT_PROFILE_FIELDS));
  const [mediaFields, setMediaFields] = useState<Set<string>>(new Set(DEFAULT_MEDIA_FIELDS));

  // Collapsed sections
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleField = (set: Set<string>, setter: React.Dispatch<React.SetStateAction<Set<string>>>, field: string) => {
    const next = new Set(set);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    setter(next);
  };

  const fetchData = useCallback(async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const pf = Array.from(profileFields).join(',');
      const mf = Array.from(mediaFields).join(',');
      const url = `/api/test/instagram?username=${encodeURIComponent(username.trim())}&fields=${pf}&media_fields=${mf}&media_limit=${mediaLimit}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error && !data.business_discovery) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [username, profileFields, mediaFields, mediaLimit]);

  const copySection = (key: string, data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const bd = result?.business_discovery as Record<string, unknown> | undefined;
  const profile = bd?.profile as Record<string, unknown> | undefined;
  const metrics = bd?.computed_metrics as Record<string, unknown> | undefined;
  const media = (bd?.media || []) as Array<Record<string, unknown>>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Instagram API Explorer
          </h1>
          <p className="text-zinc-500 mt-1">Test all Graph API endpoints for any Business/Creator account. Toggle fields, inspect raw data, decide what to keep.</p>
        </div>

        {/* Search + Field Config */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Search */}
          <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Username</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchData()}
                  placeholder="garyvee, jordanpeterson, tfrancisfit..."
                  className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
                />
              </div>
              <button
                onClick={fetchData}
                disabled={loading || !username.trim()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {loading ? 'Fetching...' : 'Fetch'}
              </button>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">Media Limit:</label>
                <select
                  value={mediaLimit}
                  onChange={e => setMediaLimit(Number(e.target.value))}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
                >
                  {[5, 10, 15, 25, 50].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Token Info */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Token Permissions</span>
            </div>
            {result?.token_permissions ? (
              <div className="space-y-1">
                {((result.token_permissions as Record<string, unknown>)?.permissions as Array<{ permission: string; status: string }>)?.map(p => (
                  <div key={p.permission} className="flex items-center gap-2 text-xs">
                    {p.status === 'granted' ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-400" />
                    )}
                    <span className={p.status === 'granted' ? 'text-zinc-300' : 'text-red-300'}>{p.permission}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Fetch a username to see permissions</p>
            )}
          </div>
        </div>

        {/* Field Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <FieldTogglePanel
            icon={<User className="w-4 h-4 text-sky-400" />}
            title="Profile Fields"
            allFields={DEFAULT_PROFILE_FIELDS}
            activeFields={profileFields}
            onToggle={f => toggleField(profileFields, setProfileFields, f)}
          />
          <FieldTogglePanel
            icon={<ImageIcon className="w-4 h-4 text-amber-400" />}
            title="Media Fields"
            allFields={DEFAULT_MEDIA_FIELDS}
            activeFields={mediaFields}
            onToggle={f => toggleField(mediaFields, setMediaFields, f)}
          />
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl"
            >
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                <span className="text-sm text-red-300 font-medium">Error:</span>
                <span className="text-sm text-red-200">{typeof error === 'string' ? error : JSON.stringify(error)}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Profile Card */}
              {profile && (
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-sky-400" />
                      <h2 className="font-semibold">Profile Data</h2>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        {(bd as Record<string, unknown>)?._status as string}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => copySection('profile', profile)} className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors">
                        {copiedSection === 'profile' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-500" />}
                      </button>
                      <button onClick={() => toggleCollapse('profile')} className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors">
                        {collapsed.profile ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />}
                      </button>
                    </div>
                  </div>
                  {!collapsed.profile && (
                    <div className="p-4">
                      {/* Profile Summary */}
                      <div className="flex items-start gap-4 mb-4">
                        {profile.profile_picture_url && (
                          <img
                            src={profile.profile_picture_url as string}
                            alt={profile.username as string}
                            className="w-16 h-16 rounded-full border-2 border-zinc-700"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold">{profile.name as string || 'N/A'}</h3>
                          <p className="text-sm text-indigo-400">@{profile.username as string}</p>
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{profile.biography as string}</p>
                        </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
                        {[
                          { label: 'Followers', value: profile.followers_count, color: 'text-sky-400' },
                          { label: 'Following', value: profile.follows_count, color: 'text-violet-400' },
                          { label: 'Posts', value: profile.media_count, color: 'text-amber-400' },
                          { label: 'Avg Likes', value: metrics?.avg_likes_per_post, color: 'text-rose-400' },
                          { label: 'Avg Comments', value: metrics?.avg_comments_per_post, color: 'text-emerald-400' },
                          { label: 'Engagement %', value: metrics?.engagement_rate_percent, suffix: '%', color: 'text-fuchsia-400' },
                        ].map(stat => (
                          <div key={stat.label} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-2.5 text-center">
                            <div className={`text-lg font-bold ${stat.color}`}>
                              {typeof stat.value === 'number' ? stat.value.toLocaleString() : '—'}{stat.suffix || ''}
                            </div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{stat.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Raw JSON */}
                      <RawJsonBlock label="Raw Profile JSON" data={profile} />
                    </div>
                  )}
                </div>
              )}

              {/* Computed Metrics */}
              {metrics && (
                <CollapsibleSection
                  icon={<BarChart3 className="w-5 h-5 text-fuchsia-400" />}
                  title="Computed Metrics"
                  badge="DERIVED"
                  badgeColor="bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20"
                  data={metrics}
                  collapsed={collapsed.metrics}
                  onToggle={() => toggleCollapse('metrics')}
                  onCopy={() => copySection('metrics', metrics)}
                  copied={copiedSection === 'metrics'}
                />
              )}

              {/* Media */}
              {media.length > 0 && (
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ImageIcon className="w-5 h-5 text-amber-400" />
                      <h2 className="font-semibold">Media ({media.length} posts)</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => copySection('media', media)} className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors">
                        {copiedSection === 'media' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-500" />}
                      </button>
                      <button onClick={() => toggleCollapse('media')} className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors">
                        {collapsed.media ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />}
                      </button>
                    </div>
                  </div>
                  {!collapsed.media && (
                    <div className="p-4 space-y-3">
                      {media.map((m, i) => (
                        <div key={m.id as string || i} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
                          <div className="flex items-start gap-3">
                            {m.media_url && (
                              <img
                                src={m.media_url as string}
                                alt=""
                                className="w-16 h-16 rounded-md object-cover border border-zinc-600 flex-shrink-0"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">
                                  {m.media_type as string || 'UNKNOWN'}
                                </span>
                                <span className="text-[10px] text-zinc-500">{m.timestamp ? new Date(m.timestamp as string).toLocaleDateString() : ''}</span>
                                {m.permalink && (
                                  <a href={m.permalink as string} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                              <p className="text-xs text-zinc-400 line-clamp-2">{m.caption as string || '(no caption)'}</p>
                              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-500">
                                <span>❤️ {((m.like_count as number) || 0).toLocaleString()}</span>
                                <span>💬 {((m.comments_count as number) || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Direct Profile */}
              {result.direct_profile && (
                <CollapsibleSection
                  icon={<User className="w-5 h-5 text-teal-400" />}
                  title="Direct Profile Query"
                  badge={(result.direct_profile as Record<string, unknown>)?._status as string}
                  badgeColor="bg-teal-500/15 text-teal-400 border-teal-500/20"
                  data={(result.direct_profile as Record<string, unknown>)?.data}
                  collapsed={collapsed.direct}
                  onToggle={() => toggleCollapse('direct')}
                  onCopy={() => copySection('direct', (result.direct_profile as Record<string, unknown>)?.data)}
                  copied={copiedSection === 'direct'}
                />
              )}

              {/* Raw Full Response */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Eye className="w-5 h-5 text-zinc-400" />
                    <h2 className="font-semibold">Full Raw Response</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => copySection('full', result)} className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors">
                      {copiedSection === 'full' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-500" />}
                    </button>
                    <button onClick={() => toggleCollapse('full')} className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors">
                      {collapsed.full ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />}
                    </button>
                  </div>
                </div>
                {!collapsed.full && (
                  <pre className="p-4 text-xs text-zinc-400 overflow-auto max-h-[600px] font-mono leading-relaxed">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Initial State */}
        {!result && !loading && !error && (
          <div className="text-center py-20">
            <Search className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500 text-lg">Enter a Business/Creator Instagram username to explore available API data</p>
            <p className="text-zinc-600 text-sm mt-2">Toggle fields on/off to customize the query, then decide what to keep in the pipeline</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function FieldTogglePanel({ icon, title, allFields, activeFields, onToggle }: {
  icon: React.ReactNode;
  title: string;
  allFields: string[];
  activeFields: Set<string>;
  onToggle: (field: string) => void;
}) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{title}</span>
        <span className="text-[10px] text-zinc-500 ml-auto">{activeFields.size}/{allFields.length} active</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {allFields.map(field => {
          const active = activeFields.has(field);
          return (
            <button
              key={field}
              onClick={() => onToggle(field)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                active
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-400 hover:border-zinc-600 line-through'
              }`}
            >
              {active ? <Eye className="w-3 h-3 inline mr-1" /> : <EyeOff className="w-3 h-3 inline mr-1" />}
              {field}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CollapsibleSection({ icon, title, badge, badgeColor, data, collapsed, onToggle, onCopy, copied }: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  badgeColor: string;
  data: unknown;
  collapsed?: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="font-semibold">{title}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeColor}`}>{badge}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCopy} className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-500" />}
          </button>
          <button onClick={onToggle} className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors">
            {collapsed ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />}
          </button>
        </div>
      </div>
      {!collapsed && <RawJsonBlock data={data} />}
    </div>
  );
}

function RawJsonBlock({ label, data }: { label?: string; data: unknown }) {
  return (
    <div>
      {label && <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 px-4 pt-2">{label}</div>}
      <pre className="p-4 text-xs text-zinc-400 overflow-auto max-h-96 font-mono leading-relaxed bg-zinc-800/30 rounded-lg mx-3 mb-3">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
