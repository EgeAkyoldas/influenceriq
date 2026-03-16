'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { AppShell } from '@/components/layout/app-shell';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setTheme } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Initialize theme on mount
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(savedTheme || 'dark');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, [setTheme]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Demo mode — no auth required, always show the app
  return <AppShell>{children}</AppShell>;
}
