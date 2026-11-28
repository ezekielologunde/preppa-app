import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text } from 'react-native';
import { useReducedMotion } from '../../ui/useReducedMotion';
import { useC } from '../../theme/ThemeContext';
import { type } from '../../theme/theme';

export function Spinner({ size = 19, color = '#fff', track }: { size?: number; color?: string; track?: string }) {
  const r = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    Animated.loop(Animated.timing(r, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true })).start();
  }, [r, reduced]);
  const spin = r.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor: track ?? color, opacity: track ? 1 : 0.3, borderTopColor: color, transform: [{ rotate: spin }] }} />;
}

export function Title({ parts }: { parts: (string | { g: string })[] }) {
  const c = useC();
  return (
    <Text style={[type(34, 900), { color: c.ink, letterSpacing: -1.5, lineHeight: 37, marginTop: 18 }]}>
      {parts.map((p, i) => (typeof p === 'string' ? p : <Text key={i} style={{ color: c.accentText }}>{p.g}</Text>))}
    </Text>
  );
}
export function Lead({ children }: { children: React.ReactNode }) {
  const c = useC();
  return <Text style={[type(15.5, 500), { color: c.soft, lineHeight: 24, marginTop: 14, maxWidth: 320 }]}>{children}</Text>;
}

export function useShake() {
  const x = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const fire = () => {
    if (reduced) return;
    x.setValue(0);
    Animated.sequence([
      Animated.timing(x, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(x, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(x, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(x, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(x, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };
  return { x, fire };
}
