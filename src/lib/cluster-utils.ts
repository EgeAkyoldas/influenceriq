import type { NicheCluster } from '@/types';

// ─── Single Cluster Metadata ────────────────────────────────────────────────

export const clusterMeta: Record<NicheCluster, {
  label: string;
  icon: string;       // Lucide icon name
  color: string;
  description: string;
}> = {
  dating:        { label: 'Dating',        icon: 'Heart',       color: 'bg-rose-500/15 text-rose-400 border-rose-500/30',     description: 'Male dating, attraction tactics, approach strategies' },
  mindset:       { label: 'Mindset',       icon: 'Brain',       color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',     description: 'Personal growth, stoicism, motivation, discipline' },
  relationships: { label: 'Relationships', icon: 'Users',       color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',  description: 'Relationship advice, attachment styles, communication' },
  masculinity:   { label: 'Masculinity',   icon: 'Shield',      color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', description: 'Masculine identity, leadership, lifestyle and brotherhood' },
};

// ─── Tier Metadata ───────────────────────────────────────────────────────────

export const tierMeta: Record<string, {
  label: string;
  color: string;
  description: string;
  criteria: string[];
}> = {
  S: {
    label: 'S Tier',
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 shadow-[0_0_12px_rgba(234,179,8,0.25)]',
    description: "Perfect fit — a benchmark profile for the target niche.",
    criteria: ["Men's dating coach", 'Face-to-camera content', '"DM for coaching" bio', '1K–50K followers', 'Active monetization'],
  },
  A: {
    label: 'A Tier',
    color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    description: 'Strong candidate — great fit with minor gaps.',
    criteria: ['Clear coaching call-to-action', 'High authority score (8+)', 'Regular face-to-camera content'],
  },
  B: {
    label: 'B Tier',
    color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    description: 'Good candidate — niche overlap but some areas are weak.',
    criteria: ['Mid-high authority (6–7.9)', 'Close to niche but not precise', 'Bio clarity may be lacking'],
  },
  C: {
    label: 'C Tier',
    color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    description: 'Weak fit — needs re-evaluation.',
    criteria: ['Low authority (4–5.9)', 'Content drifts outside niche', 'Monetization unclear'],
  },
  D: {
    label: 'D Tier',
    color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    description: 'Non-fit — rejection criteria present.',
    criteria: ['Very low authority (<4)', 'Niche mismatch', 'High risk flag count'],
  },
};

// ─── Combo Definitions ────────────────────────────────────────────────────────
// Key format: "primary:secondary"  (primary-only: "primary:")

export interface ComboInfo {
  tag: string;
  icon: string;      // Lucide icon name
  color: string;
  description: string; // shown on hover
}

const comboMap: Record<string, ComboInfo> = {
  // ── dating + X ─────────────────────────────────────────
  'dating:':              { tag: 'Pure Seducer',    icon: 'Flame',          color: 'bg-rose-500/20    text-rose-300    border-rose-500/50',          description: 'Pure attraction-focused content. Fully dominant in the dating niche.' },
  'dating:mindset':       { tag: 'Approach Artist', icon: 'Drama',          color: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/50',        description: 'Dating + psychological framing. Highlights mental prep before approaching.' },
  'dating:relationships': { tag: 'Commitment Path', icon: 'GitMerge',       color: 'bg-pink-500/20    text-pink-300    border-pink-500/50',            description: 'Bridges dating and long-term relationships, targeting the transition phase.' },
  'dating:masculinity':   { tag: 'Alpha Playbook',  icon: 'Swords',         color: 'bg-red-500/20     text-red-300     border-red-500/50',             description: 'Field tactics + masculine identity. Power, attraction, and social dominance.' },

  // ── mindset + X ────────────────────────────────────────
  'mindset:':             { tag: 'Mind Forge',       icon: 'Zap',            color: 'bg-sky-500/20     text-sky-300     border-sky-500/50',             description: 'Pure mental strength content. Discipline, stoicism, and confidence-building.' },
  'mindset:dating':       { tag: 'Frame Lord',       icon: 'Crown',          color: 'bg-violet-500/20  text-violet-300  border-violet-500/50',          description: 'Frame control, high-value posture, and inner power as the foundation of attraction.' },
  'mindset:relationships':{ tag: 'Inner Architect',  icon: 'Layers',         color: 'bg-blue-500/20    text-blue-300    border-blue-500/50',             description: 'Healthy relationships start within. Self-awareness and attachment style work.' },
  'mindset:masculinity':  { tag: 'Grounded King',    icon: 'Mountain',       color: 'bg-indigo-500/20  text-indigo-300  border-indigo-500/50',          description: 'Stoic masculinity. Emotional stability + strength + leadership. Proactive, not reactive.' },

  // ── relationships + X ──────────────────────────────────
  'relationships:':             { tag: 'Bonds Builder',    icon: 'Handshake',      color: 'bg-amber-500/20   text-amber-300   border-amber-500/50',          description: 'Relationship dynamics-focused. Communication, attachment, and long-term bonding.' },
  'relationships:dating':       { tag: 'Converted Romeo',  icon: 'RefreshCw',      color: 'bg-orange-500/20  text-orange-300  border-orange-500/50',          description: 'Transition from dating life to real relationships. Targets commitment seekers.' },
  'relationships:mindset':      { tag: 'Depth Builder',    icon: 'BookOpen',       color: 'bg-yellow-500/20  text-yellow-300  border-yellow-500/50',          description: 'Mental maturity for deeper relationships. Self-knowledge + bond quality.' },
  'relationships:masculinity':  { tag: 'Masculine Partner',icon: 'HeartHandshake', color: 'bg-lime-500/20    text-lime-300    border-lime-500/50',            description: 'Masculine codes within relationships. Strength + loyalty + leadership.' },

  // ── masculinity + X ────────────────────────────────────
  'masculinity:':             { tag: 'Raw Alpha',      icon: 'Dumbbell',       color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',        description: 'Raw masculinity. Strength, discipline, status, and identity-building.' },
  'masculinity:dating':       { tag: 'Street Sigma',   icon: 'Sword',          color: 'bg-teal-500/20    text-teal-300    border-teal-500/50',            description: 'Social dominance + field game. Urban masculinity, power projection, natural attraction.' },
  'masculinity:mindset':      { tag: 'Iron Mind',      icon: 'Anvil',          color: 'bg-cyan-500/20    text-cyan-300    border-cyan-500/50',            description: 'Iron will. Masculinity built on the mind + body + character triangle.' },
  'masculinity:relationships':{ tag: 'Tribe Father',   icon: 'TreePine',       color: 'bg-green-500/20   text-green-300   border-green-500/50',           description: 'Family and community leadership within masculine values. The clan-builder archetype.' },
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function getCombo(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): ComboInfo | null {
  if (!primary) return null;
  const key = `${primary}:${secondary ?? ''}`;
  return comboMap[key] ?? null;
}

export function getAllCombos(): Array<{ key: string } & ComboInfo> {
  return Object.entries(comboMap).map(([key, info]) => ({ key, ...info }));
}

/** Legacy single-cluster color map — used in filter badges, list views */
export const clusterColors: Record<string, string> = {
  dating:        'bg-rose-500/15 text-rose-400 border-rose-500/30',
  mindset:       'bg-blue-500/15 text-blue-400 border-blue-500/30',
  relationships: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  masculinity:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};
