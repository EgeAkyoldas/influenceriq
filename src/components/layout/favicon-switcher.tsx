'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';

/**
 * Dynamically swaps the browser tab favicon based on the active theme.
 * dark  → /lionalyze.ico  (dark icon, visible on dark chrome UI)
 * light → /lionalyze-light.ico (light icon, visible on light chrome UI)
 */
export function FaviconSwitcher() {
  const { theme } = useAppStore();

  useEffect(() => {
    const href = theme === 'dark' ? '/lionalyze.ico' : '/lionalyze-light.ico';

    // Update or create the shortcut icon link
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }, [theme]);

  return null;
}
