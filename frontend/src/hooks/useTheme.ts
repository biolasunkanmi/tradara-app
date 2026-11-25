'use client';

import { useThemeContext } from '../providers/themeContext';

export function useTheme() {
  return useThemeContext();
}