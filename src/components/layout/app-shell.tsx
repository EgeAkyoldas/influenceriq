'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, FileText, Settings,
  Moon, Sun, PanelLeftClose, PanelLeftOpen,
  Database, Activity, Menu, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '@/lib/store';
import { FaviconSwitcher } from '@/components/layout/favicon-switcher';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/leads', icon: Database, label: 'Leads' },
  { href: '/candidates', icon: Users, label: 'Candidates' },
  { href: '/flow', icon: Activity, label: 'Data Flow' },
  { href: '/reports', icon: FileText, label: 'Reports' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useAppStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logoSrc = theme === 'dark' ? '/lionalyze-light.png' : '/lionalyze-dark.png';

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      {/* Mobile overlay backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile hamburger button — fixed in header area */}
      <button
        className="fixed top-4 left-4 z-51 lg:hidden p-2 rounded-lg bg-card border border-border shadow-lg hover:bg-muted transition-colors"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 bottom-0 z-50
          bg-card border-r border-border flex flex-col overflow-hidden
          transition-all duration-300 ease-in-out
          
          /* Mobile: slide in/out based on mobileOpen */
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          w-[260px]
          
          /* Desktop: always visible, controlled by sidebarOpen for expand/collapse */
          lg:translate-x-0
          ${sidebarOpen ? 'lg:w-[240px]' : 'lg:w-[72px]'}
        `}
      >
        {/* Logo area */}
        <div className="h-16 flex items-center px-3 border-b border-border shrink-0 gap-2 overflow-hidden">
          <div
            className="shrink-0 overflow-hidden"
            style={{ width: 36, height: 36, position: 'relative' }}
          >
            <Image
              src={logoSrc}
              alt="Lionalyze"
              fill
              sizes="36px"
              style={{
                transform: 'scaleX(-1)',
                objectFit: 'contain',
                objectPosition: 'left center',
              }}
              priority
            />
          </div>

          {/* Show label: always on mobile (when open), conditionally on desktop */}
          <AnimatePresence>
            {(sidebarOpen || mobileOpen) && (
              <motion.span
                key="site-name"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.18 }}
                className="whitespace-nowrap font-bold tracking-widest text-sm uppercase select-none"
              >
                LIONALYZE
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(item => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            const showLabel = sidebarOpen || mobileOpen;

            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                      ${isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }
                    `}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <AnimatePresence mode="wait">
                      {showLabel && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className="overflow-hidden whitespace-nowrap"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Link>
                </TooltipTrigger>
                {!showLabel && (
                  <TooltipContent side="right">{item.label}</TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="p-2 border-t border-border space-y-1">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 px-3"
                onClick={toggleTheme}
              >
                {theme === 'dark'
                  ? <Sun className="w-5 h-5" />
                  : <Moon className="w-5 h-5" />
                }
                {(sidebarOpen || mobileOpen) && (
                  <span className="text-sm">
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            {!sidebarOpen && !mobileOpen && (
              <TooltipContent side="right">Toggle Theme</TooltipContent>
            )}
          </Tooltip>

          {/* Collapse / Expand — desktop only */}
          <div className="hidden lg:block">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={toggleSidebar}
                  className="w-full justify-start gap-3 px-3 h-9"
                >
                  {sidebarOpen
                    ? <PanelLeftClose className="w-4 h-4 shrink-0" />
                    : <PanelLeftOpen className="w-4 h-4 shrink-0" />
                  }
                  {sidebarOpen && (
                    <span className="text-sm text-muted-foreground">Collapse</span>
                  )}
                </Button>
              </TooltipTrigger>
              {!sidebarOpen && (
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>
      </aside>
    </>
  );
}

export function Header() {
  const { sidebarOpen } = useAppStore();
  const pathname = usePathname();

  const pageTitle =
    navItems.find(item =>
      pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
    )?.label || 'Dashboard';

  return (
    <header
      className={`
        h-16 border-b border-border flex items-center
        pl-16 pr-4 sm:pr-6
        lg:pl-6
        bg-card/80 backdrop-blur-sm sticky top-0 z-30
        transition-all duration-300
        ${sidebarOpen ? 'lg:ml-[240px]' : 'lg:ml-[72px]'}
      `}
    >
      <h1 className="text-lg font-semibold">{pageTitle}</h1>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAppStore();

  return (
    <div className="min-h-screen bg-background">
      <FaviconSwitcher />
      <Sidebar />
      <Header />
      <main
        className={`
          transition-all duration-300 p-4 sm:p-6
          ${sidebarOpen ? 'lg:ml-[240px]' : 'lg:ml-[72px]'}
        `}
      >
        {children}
      </main>
    </div>
  );
}
