'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ThemeContext, type Theme, type ThemeContextValue } from './themeContext';

export type { Theme } from './themeContext';

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

const STORAGE_KEY = 'bio-portfolio-theme';

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;

    if (saved === 'dark' || saved === 'light') {
      setThemeState(saved);
      return;
    }

    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;

    setThemeState(prefersDark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const html = document.documentElement;

    html.classList.remove('dark', 'light');
    html.classList.add(theme);

    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((previous) =>
      previous === 'dark' ? 'light' : 'dark'
    );
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === 'dark',
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}