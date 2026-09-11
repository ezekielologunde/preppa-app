import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Icon } from '../ui/Icon';
import { useReducedMotion } from '../ui/useReducedMotion';
import { type, FILL, radius, shadow } from '../theme/theme';
import { useC } from '../theme/ThemeContext';

/**
 * Branded cold-launch splash — the neutral app canvas (matches AppShell's bg), a solid
 * mark badge, and the wordmark. Same calm "Warm Trust" treatment as the rest of the app;
 * no full-bleed gradient wash.
 *
 * Handoff: this stays mounted and gated on `done` (store hydration complete). When `done`
 * flips it plays a real exit fade, THEN unmounts itself. A tiny floor lets the entrance
 * register on a sub-100ms hydrate without re-introducing an artificial delay.
 */
/** Three small dots orbiting the mark on a slow, staggered loop — purely decorative motion
 *  to keep the cold-launch beat feeling alive rather than a static logo card. */
function OrbitDots({ radius: orbitR }: { radius: number }) {
  const c = useC();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: true })).start();
  }, [spin]);
  const colors = [c.primary, c.accentText, c.primaryD];
  return (
    <>
      {colors.map((col, i) => {
        const rot = spin.interpolate({ inputRange: [0, 1], outputRange: [`${i * 120}deg`, `${i * 120 + 360}deg`] });
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute', width: orbitR * 2, height: orbitR * 2,
              alignItems: 'center', transform: [{ rotate: rot }],
            }}
          >
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: col, opacity: 0.85 }} />
          </Animated.View>
        );
      })}
    </>
  );
}

export function SplashOverlay({ done }: { done: boolean }) {
  const c = useC();
  const op = useRef(new Animated.Value(0)).current;      // whole-screen opacity (in, then out)
  const sc = useRef(new Animated.Value(0.72)).current;   // mark scale (spring in)
  const wordOp = useRef(new Animated.Value(0)).current;  // wordmark fade
  const wordY = useRef(new Animated.Value(12)).current;  // wordmark rise
  const glow = useRef(new Animated.Value(0)).current;    // pulsing ring behind the mark
  const breathe = useRef(new Animated.Value(0)).current; // the mark itself swelling/settling, in lockstep with the glow
  const reduced = useReducedMotion();
  const [gone, setGone] = useState(false);
  const entered = useRef(false);

  // Entrance (runs once).
  useEffect(() => {
    Animated.timing(op, { toValue: 1, duration: 240, useNativeDriver: true }).start(() => { entered.current = true; });
    if (reduced) { sc.setValue(1); wordOp.setValue(1); wordY.setValue(0); return; }
    Animated.spring(sc, { toValue: 1, bounciness: 9, speed: 5, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(150),
      Animated.parallel([
        Animated.timing(wordOp, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(wordY, { toValue: 0, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
    // Looping "alive while we wait" motion — a slow breathing glow ring and a tiny bob on the
    // mark itself. Both native-driven, both harmless to leave running until unmount.
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
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

  // Glow ring swells and fades as the mark itself swells slightly — the two together read as
  // one breathing shape, not a spinning-plate collection of separate loops.
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });

  return (
    <Animated.View pointerEvents="none" style={[FILL, { opacity: op, zIndex: 400, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }]}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {!reduced ? (
          <Animated.View style={{ position: 'absolute', width: 80, height: 80, borderRadius: radius.xxl, backgroundColor: c.primaryD, opacity: glowOpacity, transform: [{ scale: glowScale }] }} />
        ) : null}
        {!reduced ? <OrbitDots radius={62} /> : null}
        <Animated.View style={{ transform: [{ scale: Animated.multiply(sc, reduced ? 1 : breatheScale) }] }}>
          <View style={{ width: 80, height: 80, borderRadius: radius.xxl, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
            <Icon name="flame" size={38} color="#fff" />
          </View>
        </Animated.View>
      </View>
      <Animated.Text style={[type(32, 900), { color: c.ink, letterSpacing: -1.3, marginTop: 24, opacity: wordOp, transform: [{ translateY: wordY }] }]}>preppa</Animated.Text>
    </Animated.View>
  );
}
