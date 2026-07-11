import React, { createContext, useContext, useMemo } from 'react';
import { light, dark, Palette } from './theme';

interface ThemeShape {
  c: Palette;
  dark: boolean;
}
const ThemeContext = createContext<ThemeShape>({ c: light, dark: false });

export function ThemeProvider({ isDark, children }: { isDark: boolean; children: React.ReactNode }) {
  // Memo on isDark only: the parent (Themed) re-renders on every store change, but the palette
  // identity stays stable, so useC()/useIsDark() consumers don't re-render — this was defeating
  // every React.memo across the app.
  const value = useMemo<ThemeShape>(() => ({ c: isDark ? dark : light, dark: isDark }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Active colour palette. */
export function useC(): Palette {
  return useContext(ThemeContext).c;
}
export function useIsDark(): boolean {
  return useContext(ThemeContext).dark;
}
