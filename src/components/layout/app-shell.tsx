'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, FileText, Settings,
  Moon, Sun, PanelLeftClose, PanelLeftOpen,
  Database, Activity, Search,
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

  const logoSrc = theme === 'dark' ? '/lionalyze-light.png' : '/lionalyze-dark.png';

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={toggleSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 240 : 72 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed left-0 top-0 bottom-0 z-50 bg-card border-r border-border flex flex-col overflow-hidden"
      >
        {/* ── Logo area ──────────────────────────────────────────────────────
            Icon slot is fixed 36×36 — position never shifts between states.
            When open, "LIONALYZE" fades in beside it. No collapse button here.
        ─────────────────────────────────────────────────────────────────── */}
        <div className="h-16 flex items-center px-3 border-b border-border shrink-0 gap-2 overflow-hidden">
          {/* Fixed icon slot */}
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

          {/* Site name — appears only when sidebar is open */}
          <AnimatePresence>
            {sidebarOpen && (
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

        {/* ── Navigation ─────────────────────────────────────────────────── */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(item => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
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
                      {sidebarOpen && (
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
                {!sidebarOpen && (
                  <TooltipContent side="right">{item.label}</TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </nav>

        {/* ── Bottom actions ─────────────────────────────────────────────── */}
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
                {sidebarOpen && (
                  <span className="text-sm">
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            {!sidebarOpen && <TooltipContent side="right">Toggle Theme</TooltipContent>}
          </Tooltip>


          {/* Collapse / Expand — pinned at the very bottom of the sidebar */}
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
      </motion.aside>
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
      className="h-16 border-b border-border flex items-center px-6 bg-card/80 backdrop-blur-sm sticky top-0 z-30"
      style={{ marginLeft: sidebarOpen ? 240 : 72 }}
    >
      <div className="flex items-center gap-3">
        <Search className="w-4 h-4 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{pageTitle}</h1>
      </div>
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
        className="transition-all duration-300 p-6"
        style={{ marginLeft: sidebarOpen ? 240 : 72 }}
      >
        {children}
      </main>
    </div>
  );
}
