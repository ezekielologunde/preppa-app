/* PREPPA — design tokens.
 *
 * "Warm Trust" redesign (2026-07): moved from the vibrant orange/rainbow-gradient
 * language to a calm, photography-led, single-accent system (Airbnb-adjacent, tuned
 * warmer for a food marketplace). Every colour below is WCAG-verified in both themes
 * (see docs/REDESIGN-DIRECTION.md). The public API — Palette keys, `type()`, `radius`,
 * `shadow`, `GRAD` — is UNCHANGED so the ~74 consuming screens inherit without churn;
 * only values changed. Two gradient escape-hatches survive as WARM tints, never rainbows.
 */
import { TextStyle } from 'react-native';

/** Per-cook / fallback tint ramps. Recoloured from the old neon rainbow to a cohesive
 *  warm "spice-drawer" set (terracotta, clay, sage, plum, tan) — earthy, appetite-adjacent,
 *  never a rainbow. Kept as 8 keys because COOKS in data.ts are keyed to these. White
 *  initials read AA-large on the deeper (second) stop, which is what Avatar fills with. */
export const GRAD = {
  g1: ['#CF6B4C', '#B23A22'], // terracotta
  g2: ['#7E6C58', '#5F5142'], // warm taupe
  g3: ['#6F8C68', '#4F6B4C'], // sage
  g4: ['#D18A4E', '#B96E2F'], // amber clay
  g5: ['#8C7CAC', '#6B5A93'], // muted plum
  g6: ['#C56B62', '#A84B45'], // clay rose
  g7: ['#5F7E88', '#456068'], // slate teal
  g8: ['#B78A5E', '#987043'], // tan
} as const;
export type GradKey = keyof typeof GRAD;

/** Brand washes — recoloured to a single warm-coral family (was orange→pink→purple rainbow). */
export const BRAND_GRAD = ['#E9724A', '#E24A38', '#B93A22'] as const;
export const WARM_GRAD = ['#E9724A', '#E24A38'] as const;

/** Theme-invariant brand marks (splash / onboarding / adaptive icon parity). */
export const BRAND_PRIMARY = '#E24A38';
export const BRAND_PURPLE = '#6B4A93';

export interface Palette {
  primary: string; primaryD: string; primaryL: string;
  purple: string; purpleL: string; purpleOn: string; // "purple" is now the reserved PREMIUM plum
  ink: string; ink2: string; soft: string; muted: string;
  surface: string; bg: string; bg2: string; border: string; border2: string;
  /** Functional boundary (inputs/controls whose edge is their only affordance) — ≥3:1 per WCAG 1.4.11. */
  borderF: string;
  /** Stable dark "feature" surface (premium cards / dark buttons) — dark in BOTH themes. */
  feature: string;
  green: string; green2: string; greenL: string;
  blue: string; blueL: string; pink: string; pinkL: string; red: string; redL: string; star: string;
  unread: string;
}

/** Light — warm near-white canvas, one persimmon accent, warmth carried by ink + insets + imagery. */
export const light: Palette = {
  primary: '#E24A38', primaryD: '#B93A22', primaryL: '#FBEBE6', // primaryD = accent TEXT + button FILL (white-on = 5.7:1)
  purple: '#6B4A93', purpleL: '#F1EAF8', purpleOn: '#5A3E7E',
  ink: '#221E1B', ink2: '#34302B', soft: '#6A645E', muted: '#67615A',
  surface: '#FFFFFF', bg: '#FAFAF9', bg2: '#F3F1EE', border: '#EAE6E1', border2: '#F0ECE7',
  borderF: '#948F86',
  feature: '#1E1A16',
  green: '#127C43', green2: '#1F9D57', greenL: '#E6F3EC',
  blue: '#0B6FA8', blueL: '#E3F1FA', pink: '#DB2777', pinkL: '#FCE7F1', red: '#D93A2B', redL: '#FDECEC', star: '#B7801A',
  unread: '#FFF6F3',
};

/** Dark — warm charcoal, same accent, brighter semantics (dark bg lifts contrast). */
export const dark: Palette = {
  primary: '#E24A38', primaryD: '#B93A22', primaryL: '#3A241E',
  purple: '#9E7FD0', purpleL: '#2A2136', purpleOn: '#C9AEF0',
  ink: '#F4EFE8', ink2: '#E7DFD4', soft: '#B4A99B', muted: '#A09687',
  surface: '#201C17', bg: '#15120F', bg2: '#2A241D', border: '#332C23', border2: '#2A241D',
  borderF: '#776C60',
  feature: '#241C15',
  green: '#22C55E', green2: '#22C55E', greenL: '#16281B',
  blue: '#38BDF8', blueL: '#122836', pink: '#F472A6', pinkL: '#331A28', red: '#F26558', redL: '#3A1D1D', star: '#E0A020',
  unread: 'rgba(226,74,56,.09)',
};

// Palettes are per-theme constants; freezing makes the "dark can never mutate light"
// guarantee enforced at runtime rather than merely conventional.
Object.freeze(light);
Object.freeze(dark);

/** Absolute fill (StyleSheet.absoluteFillObject isn't in this RN version's types). */
export const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Rounding hierarchy — deliberately tiered (NOT uniform): controls 12, cards 16, sheets 24, pills 999.
 *  Uniform rounding is its own slop tell, so buttons/inputs stay tighter than cards. */
export const radius = {
  sm: 10, md: 12, lg: 14, card: 16, xl: 18, xxl: 20, hero: 20, sheet: 24, pill: 999,
};

/** Hanken Grotesk — a warm humanist grotesque (chosen over Inter/Jakarta, both AI-default tells).
 *  Loaded weights 400/500/600/700. The old 800/900 "black-weight reflex" (~480 call sites) is
 *  capped at 700 here so the whole app de-shouts with ZERO call-site churn; per-slice cleanup
 *  rewrites literal weights toward 600 headings over time. */
export const FONT: Record<number, string> = {
  400: 'HankenGrotesk_400Regular',
  500: 'HankenGrotesk_500Medium',
  600: 'HankenGrotesk_600SemiBold',
  700: 'HankenGrotesk_700Bold',
  800: 'HankenGrotesk_700Bold', // extrabold reflex → 700
  900: 'HankenGrotesk_700Bold', // black reflex → 700
};

/** Fraunces — warm humanist serif, ONE editorial role only (hero display). Never body/UI. */
export const SERIF: Record<number, string> = {
  400: 'Fraunces_400Regular',
  500: 'Fraunces_500Medium',
  600: 'Fraunces_600SemiBold',
  700: 'Fraunces_700Bold',
};

/** Build a text style with the right Hanken face. */
export function type(size: number, weight: keyof typeof FONT | number = 500, opts: Partial<TextStyle> = {}): TextStyle {
  return {
    fontFamily: FONT[weight as number] || FONT[500],
    fontSize: size,
    ...opts,
  };
}

/** Editorial serif style — hero display moments only (e.g. the Home greeting). */
export function serif(size: number, weight: keyof typeof SERIF | number = 600, opts: Partial<TextStyle> = {}): TextStyle {
  return {
    fontFamily: SERIF[weight as number] || SERIF[600],
    fontSize: size,
    ...opts,
  };
}

/** Tabular (monospaced) figures — use on prices/totals/timers so digits don't shift. */
export const tnum = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };

export const shadow = {
  card: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  soft: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  hero: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  // Retired the orange glow. Kept the key (20 call sites) — now a soft neutral lift so those
  // views keep their elevation instead of going flat. Replace per-site with `soft`+border over time.
  brand: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  float: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
};
