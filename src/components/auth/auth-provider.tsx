'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { AppShell } from '@/components/layout/app-shell';
import { LoginForm } from '@/components/auth/login-form';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, checkAuth, setTheme } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    checkAuth();
    // Initialize theme
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    setTheme(savedTheme || 'dark');
    setMounted(true);
  }, [checkAuth, setTheme]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return <AppShell>{children}</AppShell>;
}
