/* PREPPA — design tokens, ported 1:1 from the prototype CSS custom properties. */
import { TextStyle } from 'react-native';

export const GRAD = {
  g1: ['#FF6B35', '#F7931E'],
  g2: ['#667EEA', '#764BA2'],
  g3: ['#11998E', '#38EF7D'],
  g4: ['#FF8A4C', '#F26B1D'],
  g5: ['#A8E063', '#56AB2F'],
  g6: ['#EF4444', '#F97316'],
  g7: ['#7C3AED', '#A855F7'],
  g8: ['#0EA5E9', '#6366F1'],
} as const;
export type GradKey = keyof typeof GRAD;

/** Brand gradients used for headline text / washes. */
export const BRAND_GRAD = ['#F26B1D', '#FF6B9D', '#7C3AED'] as const;
export const WARM_GRAD = ['#FF8C42', '#EC4899'] as const;

export interface Palette {
  primary: string; primaryD: string; primaryL: string;
  purple: string; purpleL: string;
  ink: string; ink2: string; soft: string; muted: string;
  surface: string; bg: string; bg2: string; border: string; border2: string;
  /** Stable dark "feature" surface (premium cards / dark buttons) — stays dark in BOTH themes so hard-coded white text remains readable. */
  feature: string;
  green: string; green2: string; greenL: string;
  blue: string; blueL: string; pink: string; pinkL: string; red: string; star: string;
  unread: string;
}

export const light: Palette = {
  primary: '#F26B1D', primaryD: '#C0560F', primaryL: '#FFF1E6',
  purple: '#7C3AED', purpleL: '#F1EAFE',
  ink: '#0E0E10', ink2: '#1C1C1E', soft: '#5A5A66', muted: '#6E6E78',
  surface: '#FFFFFF', bg: '#F7F7F9', bg2: '#F2F2F5', border: '#E6E6EE', border2: '#EDEDF2',
  feature: '#141210',
  green: '#16A34A', green2: '#22C55E', greenL: '#E7F7EE',
  blue: '#0EA5E9', blueL: '#E5F4FD', pink: '#EC4899', pinkL: '#FDE9F3', red: '#EF4444', star: '#F59E0B',
  unread: '#FFFBF6',
};

/** Warm near-black dark theme. */
export const dark: Palette = {
  primary: '#F26B1D', primaryD: '#C0560F', primaryL: '#3A2413',
  purple: '#7C3AED', purpleL: '#2B2138',
  ink: '#F6F1EA', ink2: '#EAE3D9', soft: '#B6AB9D', muted: '#9A8F7E',
  surface: '#1F1A15', bg: '#151210', bg2: '#2B241D', border: '#332C23', border2: '#2A241D',
  feature: '#241C15',
  green: '#16A34A', green2: '#22C55E', greenL: '#16281B',
  blue: '#0EA5E9', blueL: '#122836', pink: '#EC4899', pinkL: '#331A28', red: '#EF4444', star: '#F59E0B',
  unread: 'rgba(232,97,26,.09)',
};

// Palettes are per-theme constants; freezing makes the "dark can never mutate light"
// guarantee enforced at runtime rather than merely conventional.
Object.freeze(light);
Object.freeze(dark);

/** Absolute fill (StyleSheet.absoluteFillObject isn't in this RN version's types). */
export const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

export const radius = {
  sm: 12, md: 14, lg: 16, card: 18, xl: 20, xxl: 22, hero: 24, sheet: 26, pill: 999,
};

/** Inter font-family names keyed by CSS numeric weight. */
export const FONT: Record<number, string> = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
  900: 'Inter_900Black',
};

/** Build a text style with the right Inter face. */
export function type(size: number, weight: keyof typeof FONT | number = 500, opts: Partial<TextStyle> = {}): TextStyle {
  return {
    fontFamily: FONT[weight as number] || FONT[500],
    fontSize: size,
    ...opts,
  };
}

/** Tabular (monospaced) figures — use on prices/totals/timers so digits don't shift. */
export const tnum = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };

export const shadow = {
  card: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  soft: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  hero: { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  brand: { shadowColor: '#F26B1D', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  float: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
};
