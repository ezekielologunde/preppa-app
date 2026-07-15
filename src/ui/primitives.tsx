import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, Text, ActivityIndicator, StyleProp, ViewStyle, TextStyle, PressableProps } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { GRAD, GradKey, radius, type, shadow, tnum, FILL } from '../theme/theme';
import { useC } from '../theme/ThemeContext';
import { COOKS, CookId, Grad } from '../data/data';
import { Icon } from './Icon';
import { useReducedMotion } from './useReducedMotion';

/** Resolve a grad key OR a [start,end] tuple to a colour pair. */
export function gradColors(g: GradKey | Grad | string): readonly [string, string, ...string[]] {
  if (Array.isArray(g)) return g as any;
  if (typeof g === 'string' && (GRAD as any)[g]) return (GRAD as any)[g];
  return GRAD.g4;
}

/** Pressable with a spring-ish scale-down on press (the prototype's :active feedback). */
export function Press({
  children,
  onPress,
  style,
  scale = 0.97,
  disabled,
  hitSlop,
  label,
  selected,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scale?: number;
  disabled?: boolean;
  hitSlop?: PressableProps['hitSlop'];
  /** Accessibility label — required for icon-only buttons (no readable text child). */
  label?: string;
  /** Accessibility selected state (e.g. a rating star or a chosen option). */
  selected?: boolean;
}) {
  const a = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const to = (v: number) => {
    if (reduced) { a.setValue(1); return; } // no scale motion when Reduce Motion is on
    Animated.spring(a, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  // Sizing/placement props must live on the Pressable itself so `flex`/`alignSelf`
  // actually stretch the touchable (e.g. equal-width segmented controls, tip chips).
  // The visual box + scale transform stay on the inner view so the press feedback
  // animates the button, not its layout slot.
  const flat = StyleSheet.flatten(style) || {};
  const { flex, flexGrow, flexShrink, flexBasis, alignSelf, ...box } = flat as any;
  const outer: ViewStyle = {};
  if (flex !== undefined) outer.flex = flex;
  if (flexGrow !== undefined) outer.flexGrow = flexGrow;
  if (flexShrink !== undefined) outer.flexShrink = flexShrink;
  if (flexBasis !== undefined) outer.flexBasis = flexBasis;
  if (alignSelf !== undefined) outer.alignSelf = alignSelf;
  return (
    <Pressable
      style={outer}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected }}
      onPressIn={() => to(scale)}
      onPressOut={() => to(1)}
    >
      <Animated.View style={[{ transform: [{ scale: a }] }, box]}>{children}</Animated.View>
    </Pressable>
  );
}

/** 135deg linear-gradient fill box. Pass `img` to show a real photo over it —
 *  the gradient stays visible while it loads and if it fails (graceful fallback). */
export function GradBox({
  grad,
  style,
  children,
  radius: r,
  img,
  fallbackIcon,
  fallbackSize = 22,
}: {
  grad: GradKey | Grad | string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  radius?: number;
  img?: string;
  fallbackIcon?: string; // centered glyph shown on the gradient when there's no photo
  fallbackSize?: number;
}) {
  const [err, setErr] = useState(false);
  const showImg = !!img && !err;
  return (
    <LinearGradient
      colors={gradColors(grad)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[r ? { borderRadius: r } : null, img ? { overflow: 'hidden' } : null, { overflow: 'hidden' }, style]}
    >
      {showImg ? (
        // expo-image: memory+disk cache (repeat views are instant), a soft fade-in, and a real
        // lazy-loaded <img> on web. The gradient behind is the placeholder / error fallback.
        <Image source={{ uri: img }} onError={() => setErr(true)} contentFit="cover" cachePolicy="memory-disk" transition={150} style={FILL as any} />
      ) : null}
      {!showImg && fallbackIcon ? (
        // "photo pending" mark — reads as intentional (real cooks' meals have no photo yet),
        // not a broken/empty color block.
        <View style={[FILL as any, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
          <Icon name={fallbackIcon as any} size={fallbackSize} color="rgba(255,255,255,0.55)" />
        </View>
      ) : null}
      {children}
    </LinearGradient>
  );
}

export function Avatar({ cook, size = 46, rad = 14, fontSize }: { cook: CookId; size?: number; rad?: number; fontSize?: number }) {
  const c = COOKS[cook];
  // Flat warm-neutral chip (deep end of the cook's spice-drawer tint) — no rainbow gradient.
  // Per-cook hue is retained so cooks stay distinguishable; white initial reads AA-large.
  const fill = gradColors(c.grad)[1];
  return (
    <View style={{ width: size, height: size, borderRadius: rad, backgroundColor: fill, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type(fontSize || size * 0.42, 700), { color: '#fff' }]}>{c.initial}</Text>
    </View>
  );
}

/** Small solid-colour avatar (reviews, subscribers) keyed off a grad. */
export function GradAvatar({ grad, letter, size = 40, rad = 13, fontSize }: { grad: GradKey | Grad; letter: string; size?: number; rad?: number; fontSize?: number }) {
  const fill = gradColors(grad)[1];
  return (
    <View style={{ width: size, height: size, borderRadius: rad, backgroundColor: fill, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type(fontSize || size * 0.42, 700), { color: '#fff' }]}>{letter}</Text>
    </View>
  );
}

/** Shimmer placeholder that mirrors a real content silhouette (card, line, avatar) while it
 *  loads — replaces mid-content spinners. Respects Reduce Motion (renders a static tint). */
export function Skeleton({ w, h = 14, r = 8, style }: { w?: number | `${number}%`; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const c = useC();
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, a]);
  return (
    <Animated.View
      style={[
        { width: w as any, height: h, borderRadius: r, backgroundColor: c.bg2, opacity: reduced ? 0.7 : a },
        style,
      ]}
    />
  );
}

export function Stepper({ value, onDec, onInc, sm }: { value: number; onDec: () => void; onInc: () => void; sm?: boolean }) {
  const c = useC();
  const btn = sm ? 30 : 38;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg2, borderRadius: radius.pill, padding: 4 }}>
      <Press scale={0.9} onPress={onDec} label="Decrease" hitSlop={10}>
        <View style={[st.stepBtn, { width: btn, height: btn, backgroundColor: c.surface }, shadow.soft]}>
          <Icon name="minus" size={sm ? 15 : 18} color={c.ink} />
        </View>
      </Press>
      <Text style={[type(sm ? 15 : 17, 700), { color: c.ink, minWidth: 40, textAlign: 'center' }, tnum]}>{value}</Text>
      <Press scale={0.9} onPress={onInc} label="Increase" hitSlop={10}>
        <View style={[st.stepBtn, { width: btn, height: btn, backgroundColor: c.surface }, shadow.soft]}>
          <Icon name="plus" size={sm ? 15 : 18} color={c.ink} />
        </View>
      </Press>
    </View>
  );
}

/** iOS-style on/off toggle (visual only — the caller owns the state). */
export function Switch({ on }: { on: boolean }) {
  const c = useC();
  return (
    <View style={{ width: 46, height: 28, borderRadius: radius.pill, backgroundColor: on ? c.green : c.bg2, justifyContent: 'center', padding: 3 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', transform: [{ translateX: on ? 18 : 0 }], ...shadow.soft }} />
    </View>
  );
}

export function Stars({ n = 5, size = 15 }: { n?: number; size?: number }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: n }).map((_, i) => (
        <Icon key={i} name="star" size={size} color={c.star} />
      ))}
    </View>
  );
}

type BtnVariant = 'pri' | 'dark' | 'ghost';
export function Btn({
  label,
  onPress,
  variant = 'pri',
  block,
  lg,
  disabled,
  loading,
  icon,
  iconRight,
  style,
  flex,
  height,
}: {
  label?: string;
  onPress?: () => void;
  variant?: BtnVariant;
  block?: boolean;
  lg?: boolean;
  disabled?: boolean;
  /** Show a spinner and block presses (prevents double-fire on async actions). */
  loading?: boolean;
  icon?: string;
  iconRight?: string;
  style?: StyleProp<ViewStyle>;
  flex?: number;
  height?: number;
}) {
  const c = useC();
  const h = height ?? (lg ? 56 : 52);
  // 'pri' fills with primaryD (white-on = 5.7:1 AA); the lighter `primary` is reserved for
  // tints/marks and would fail as a button fill (3.98:1). Rounded-rect (radius.md), not pill.
  const bg = variant === 'pri' ? c.primaryD : variant === 'dark' ? c.ink : c.surface;
  const fg = variant === 'ghost' ? c.ink : variant === 'dark' ? c.surface : '#fff';
  const blocked = disabled || loading;
  const base: ViewStyle = {
    height: h,
    borderRadius: radius.md,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: bg,
    opacity: blocked ? 0.55 : 1,
  };
  const extra: ViewStyle =
    variant === 'ghost'
      ? { borderWidth: 1, borderColor: c.borderF, ...shadow.soft }
      : variant === 'pri'
        ? shadow.soft
        : {};
  return (
    <Press scale={0.97} disabled={blocked} onPress={loading ? undefined : onPress} label={label} style={[block ? { width: '100%' } : null, flex ? { flex } : null, style]}>
      <View style={[base, extra]}>
        {loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          <>
            {icon ? <Icon name={icon} size={lg ? 19 : 18} color={fg} /> : null}
            {label ? <Text style={[type(lg ? 17 : 16, 700), { color: fg, letterSpacing: -0.1 }]}>{label}</Text> : null}
            {iconRight ? <Icon name={iconRight} size={lg ? 19 : 18} color={fg} /> : null}
          </>
        )}
      </View>
    </Press>
  );
}

/** Round icon button (42x42 circle by default). */
export function IconBtn({ name, onPress, size = 42, iconSize = 18, bg, color, dot, label }: { name: string; onPress?: () => void; size?: number; iconSize?: number; bg?: string; color?: string; dot?: boolean; label?: string }) {
  const c = useC();
  return (
    <Press scale={0.9} onPress={onPress} label={label ?? name}>
      <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}>
        <Icon name={name} size={iconSize} color={color ?? c.ink} />
        {dot ? <View style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary, borderWidth: 2, borderColor: bg ?? c.surface }} /> : null}
      </View>
    </Press>
  );
}

const st = {
  stepBtn: {
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
