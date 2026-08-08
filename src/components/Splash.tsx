import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Icon } from '../ui/Icon';
import { useReducedMotion } from '../ui/useReducedMotion';
import { type, FILL, ONBOARD_GRAD } from '../theme/theme';

/**
 * Branded cold-launch splash on the full-bleed brand gradient — the SAME gradient the
 * Onboarding welcome step sits on, so cold-launch → welcome is a single continuous wash.
 * The mark is real frosted glass (BlurView + hairline highlight), not a flat tint — the
 * "high-end" pass. Wordmark rises in after.
 *
 * Handoff: this stays mounted and gated on `done` (store hydration complete). When `done`
 * flips it plays a real exit fade, THEN unmounts itself. A tiny floor lets the entrance
 * register on a sub-100ms hydrate without re-introducing an artificial delay.
 */
export function SplashOverlay({ done }: { done: boolean }) {
  const op = useRef(new Animated.Value(0)).current;      // whole-screen opacity (in, then out)
  const sc = useRef(new Animated.Value(0.72)).current;   // mark scale (spring in)
  const wordOp = useRef(new Animated.Value(0)).current;  // wordmark fade
  const wordY = useRef(new Animated.Value(12)).current;  // wordmark rise
  const haloOp = useRef(new Animated.Value(0)).current;  // halo fade-in with the mark
  const reduced = useReducedMotion();
  const [gone, setGone] = useState(false);
  const entered = useRef(false);

  // Entrance (runs once).
  useEffect(() => {
    Animated.timing(op, { toValue: 1, duration: 240, useNativeDriver: true }).start(() => { entered.current = true; });
    if (reduced) { sc.setValue(1); wordOp.setValue(1); wordY.setValue(0); haloOp.setValue(1); return; }
    Animated.timing(haloOp, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    Animated.spring(sc, { toValue: 1, bounciness: 9, speed: 5, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(150),
      Animated.parallel([
        Animated.timing(wordOp, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(wordY, { toValue: 0, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Graceful exit once the store is ready. Floor to ~220ms so an instant hydrate still shows
  // the brand for a beat instead of a one-frame flash-cut; then fade out and unmount.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      Animated.timing(op, { toValue: 0, duration: 460, easing: Easing.out(Easing.quad), useNativeDriver: true })
        .start(({ finished }) => { if (finished) setGone(true); });
    }, 220);
    return () => clearTimeout(t);
  }, [done, op]);

  if (gone) return null;

  return (
    <Animated.View pointerEvents="none" style={[FILL, { opacity: op, zIndex: 400 }]}>
      <LinearGradient colors={ONBOARD_GRAD} style={[FILL, { alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.View style={{ width: 108, height: 108, borderRadius: 30, alignItems: 'center', justifyContent: 'center', opacity: haloOp, backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <Animated.View
            style={{
              width: 80, height: 80, borderRadius: 24, overflow: 'hidden',
              alignItems: 'center', justifyContent: 'center', transform: [{ scale: sc }],
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
              shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
            }}
          >
            <BlurView intensity={40} tint="light" style={[FILL, { alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name="flame" size={38} color="#fff" />
            </BlurView>
          </Animated.View>
        </Animated.View>
        <Animated.Text style={[type(32, 900), { color: '#fff', letterSpacing: -1.3, marginTop: 24, opacity: wordOp, transform: [{ translateY: wordY }] }]}>preppa</Animated.Text>
      </LinearGradient>
    </Animated.View>
  );
}
