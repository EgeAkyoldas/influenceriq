import { create } from 'zustand';
import type { NicheCluster, Tier, AnalysisStatus } from '@/types';

interface ResearchState {
  researches: Array<{
    id: number;
    seed_type: string;
    seed_value: string;
    status: AnalysisStatus;
    profiles_found: number;
    profiles_analyzed: number;
    created_at: string;
  }>;
  activeResearchId: number | null;
  isSubmitting: boolean;
}

interface CandidateFilters {
  cluster: NicheCluster | null;
  tier: Tier | null;
  archetype: string | null;
  source: string | null;
  search: string;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  page: number;
  limit: number;
}

interface UIState {
  theme: 'dark' | 'light';
  sidebarOpen: boolean;
  isAuthenticated: boolean;
  token: string | null;
  username: string | null;
}

interface DashboardStats {
  stats: {
    totalProfiles: number;
    analyzedProfiles: number;
    activeResearch: number;
  };
  recentResearch: Array<Record<string, unknown>>;
  clusterDistribution: Array<{ cluster: string; count: number }>;
  tierDistribution: Array<{ tier: string; count: number }>;
  topProfiles: Array<{
    username: string;
    followers_count: number;
    profile_pic_url: string;
    authority_score: number;
    primary_cluster: string;
    tier: string;
  }>;
}

interface AppStore extends ResearchState, UIState {
  filters: CandidateFilters;
  dashboardStats: DashboardStats | null;

  // Auth
  login: (token: string, username: string) => void;
  logout: () => void;
  checkAuth: () => boolean;

  // Theme
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;

  // Sidebar
  toggleSidebar: () => void;

  // Research
  setResearches: (researches: ResearchState['researches']) => void;
  setActiveResearch: (id: number | null) => void;
  setSubmitting: (v: boolean) => void;

  // Filters
  setFilter: (key: keyof CandidateFilters, value: unknown) => void;
  resetFilters: () => void;

  // Dashboard
  setDashboardStats: (stats: DashboardStats) => void;
}

const defaultFilters: CandidateFilters = {
  cluster: null,
  tier: null,
  archetype: null,
  source: null,
  search: '',
  sortBy: 'authority_score',
  sortOrder: 'DESC',
  page: 1,
  limit: 25,
};

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  researches: [],
  activeResearchId: null,
  isSubmitting: false,
  theme: 'dark',
  sidebarOpen: true,
  isAuthenticated: true, // Demo mode
  token: null,
  username: null,
  filters: { ...defaultFilters },
  dashboardStats: null,

  // Auth
  login: (token, username) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_username', username);
    }
    set({ isAuthenticated: true, token, username });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_username');
    }
    set({ isAuthenticated: false, token: null, username: null });
  },
  checkAuth: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      const username = localStorage.getItem('auth_username');
      if (token && username) {
        set({ isAuthenticated: true, token, username });
        return true;
      }
    }
    return get().isAuthenticated;
  },

  // Theme
  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      localStorage.setItem('theme', newTheme);
    }
    set({ theme: newTheme });
  },
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      localStorage.setItem('theme', theme);
    }
    set({ theme });
  },

  // Sidebar
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  // Research
  setResearches: (researches) => set({ researches }),
  setActiveResearch: (id) => set({ activeResearchId: id }),
  setSubmitting: (v) => set({ isSubmitting: v }),

  // Filters
  setFilter: (key, value) => set(s => ({
    filters: { ...s.filters, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) },
  })),
  resetFilters: () => set({ filters: { ...defaultFilters } }),

  // Dashboard
  setDashboardStats: (stats) => set({ dashboardStats: stats }),
}));
