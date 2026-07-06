import React, { createContext, useContext } from 'react';
import { light, dark, Palette } from './theme';

interface ThemeShape {
  c: Palette;
  dark: boolean;
}
const ThemeContext = createContext<ThemeShape>({ c: light, dark: false });

export function ThemeProvider({ isDark, children }: { isDark: boolean; children: React.ReactNode }) {
  return <ThemeContext.Provider value={{ c: isDark ? dark : light, dark: isDark }}>{children}</ThemeContext.Provider>;
}

/** Active colour palette. */
export function useC(): Palette {
  return useContext(ThemeContext).c;
}
export function useIsDark(): boolean {
  return useContext(ThemeContext).dark;
}
