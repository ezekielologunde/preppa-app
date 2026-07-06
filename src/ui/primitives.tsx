import React, { useRef } from 'react';
import { Animated, Pressable, View, Text, ActivityIndicator, StyleProp, ViewStyle, TextStyle, PressableProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GRAD, GradKey, radius, type, shadow, tnum } from '../theme/theme';
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
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scale?: number;
  disabled?: boolean;
  hitSlop?: PressableProps['hitSlop'];
  /** Accessibility label — required for icon-only buttons (no readable text child). */
  label?: string;
}) {
  const a = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const to = (v: number) => {
    if (reduced) { a.setValue(1); return; } // no scale motion when Reduce Motion is on
    Animated.spring(a, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPressIn={() => to(scale)}
      onPressOut={() => to(1)}
    >
      <Animated.View style={[{ transform: [{ scale: a }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/** 135deg linear-gradient fill box (the ListingImage placeholder convention). */
export function GradBox({
  grad,
  style,
  children,
  radius: r,
}: {
  grad: GradKey | Grad | string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  radius?: number;
}) {
  return (
    <LinearGradient
      colors={gradColors(grad)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[r ? { borderRadius: r } : null, style]}
    >
      {children}
    </LinearGradient>
  );
}

export function Avatar({ cook, size = 46, rad = 14, fontSize }: { cook: CookId; size?: number; rad?: number; fontSize?: number }) {
  const c = COOKS[cook];
  return (
    <GradBox grad={c.grad} style={{ width: size, height: size, borderRadius: rad, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type(fontSize || size * 0.4, 900), { color: '#fff' }]}>{c.initial}</Text>
    </GradBox>
  );
}

/** Small solid-colour avatar (reviews, subscribers) keyed off a grad. */
export function GradAvatar({ grad, letter, size = 40, rad = 13, fontSize }: { grad: GradKey | Grad; letter: string; size?: number; rad?: number; fontSize?: number }) {
  return (
    <GradBox grad={grad} style={{ width: size, height: size, borderRadius: rad, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type(fontSize || size * 0.4, 900), { color: '#fff' }]}>{letter}</Text>
    </GradBox>
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
      <Text style={[type(sm ? 15 : 17, 900), { color: c.ink, minWidth: 40, textAlign: 'center' }, tnum]}>{value}</Text>
      <Press scale={0.9} onPress={onInc} label="Increase" hitSlop={10}>
        <View style={[st.stepBtn, { width: btn, height: btn, backgroundColor: c.surface }, shadow.soft]}>
          <Icon name="plus" size={sm ? 15 : 18} color={c.ink} />
        </View>
      </Press>
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
  const bg = variant === 'pri' ? c.primary : variant === 'dark' ? c.ink : c.surface;
  const fg = variant === 'ghost' ? c.ink : '#fff';
  const blocked = disabled || loading;
  const base: ViewStyle = {
    height: h,
    borderRadius: radius.pill,
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
      ? { borderWidth: 1.5, borderColor: c.border, ...shadow.soft }
      : variant === 'pri'
        ? shadow.brand
        : {};
  return (
    <Press scale={0.96} disabled={blocked} onPress={loading ? undefined : onPress} label={label} style={[block ? { width: '100%' } : null, flex ? { flex } : null, style]}>
      <View style={[base, extra]}>
        {loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          <>
            {icon ? <Icon name={icon} size={lg ? 19 : 18} color={fg} /> : null}
            {label ? <Text style={[type(lg ? 17 : 16, 800), { color: fg, letterSpacing: -0.1 }]}>{label}</Text> : null}
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
