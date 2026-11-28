import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/store';
import { Spinner, Title, Lead } from './auth/authUi';
import { Auth } from './auth/AuthForm';
import { Code } from './auth/CodeForm';
import { captureCurrentLocation } from '../lib/geo';
import { Icon } from '../ui/Icon';
import { Press, GradBox, Btn } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import { useC } from '../theme/ThemeContext';
import { type, GRAD, shadow, radius, FILL } from '../theme/theme';

/* ---------- steps ---------- */
function JoiningPill() {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, marginTop: 22, ...shadow.soft }}>
      <View style={{ flexDirection: 'row' }}>
        {[GRAD.g3, GRAD.g7, GRAD.g6].map((g, i) => (
          <GradBox key={i} grad={g as any} style={{ width: 22, height: 22, borderRadius: 11, marginLeft: i === 0 ? 0 : -8, borderWidth: 2, borderColor: c.surface }} />
        ))}
      </View>
      <Text style={[type(12.5, 800), { color: c.ink }]}>Local Preppas joining every week</Text>
    </View>
  );
}

/** Same treatment as Splash's mark — solid `primaryD` circle — so cold-launch → welcome
 *  reads as one continuous brand mark, not a color swap. */
function Mark({ size = 74, iconSize = 38 }: { size?: number; iconSize?: number }) {
  const c = useC();
  return (
    <View style={{ width: size, height: size, borderRadius: radius.xxl, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
      <Icon name="flame" size={iconSize} color="#fff" />
    </View>
  );
}

/** Fade + rise entrance for one welcome-screen element, staggered by `delay`. */
function Reveal({ delay, children, style }: { delay: number; children: React.ReactNode; style?: any }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(14)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { op.setValue(1); y.setValue(0); return; }
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: y }] }, style]}>{children}</Animated.View>;
}

/** Continuous slow breathing on the welcome mark — a gentle swell/settle plus a soft glow
 *  ring behind it, same idle motion as the cold-launch splash mark, so the brand mark reads
 *  as one living shape across the handoff rather than resetting to dead-still. */
function FloatingMark({ size, iconSize }: { size: number; iconSize: number }) {
  const c = useC();
  const breathe = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [breathe, reduced]);
  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const glowScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });
  const glowOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {!reduced ? (
        <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: radius.xxl, backgroundColor: c.primaryD, opacity: glowOpacity, transform: [{ scale: glowScale }] }} />
      ) : null}
      <Animated.View style={{ transform: [{ scale: reduced ? 1 : scale }] }}>
        <Mark size={size} iconSize={iconSize} />
      </Animated.View>
    </View>
  );
}

function Welcome({ go }: { go: (s: string, m: 'signin' | 'signup') => void }) {
  const c = useC();
  return (
    <>
      <View style={{ flex: 0.6 }} />
      <Reveal delay={0} style={{ alignSelf: 'center' }}><FloatingMark size={88} iconSize={42} /></Reveal>
      <Reveal delay={90}><Text style={[type(28, 900), { color: c.ink, letterSpacing: -1, marginTop: 18, alignSelf: 'center', textAlign: 'center' }]}>preppa</Text></Reveal>
      <Reveal delay={160}><Text style={[type(17, 600), { color: c.soft, lineHeight: 25, marginTop: 14, textAlign: 'center' }]}>Real food from real local Preppas near you.</Text></Reveal>
      <Reveal delay={240}><JoiningPill /></Reveal>
      <View style={{ flex: 1 }} />
      <Reveal delay={320}>
        <Btn label="Get Started — It's Free" variant="pri" onPress={() => go('auth', 'signup')} block lg />
      <Pressable onPress={() => go('auth', 'signin')} accessibilityRole="button" style={{ marginTop: 16, alignSelf: 'center' }}>
          <Text style={[type(14, 700), { color: c.soft }]}>Already a member? <Text style={{ color: c.ink, textDecorationLine: 'underline' }}>Sign in →</Text></Text>
        </Pressable>
        <Text style={[type(11.5, 600), { color: c.muted, textAlign: 'center', marginTop: 14 }]}>By continuing you agree to Preppa’s Terms & Food Safety Standards.</Text>
      </Reveal>
    </>
  );
}

const GOALS = [
  { id: 'daily', ico: 'home', grad: GRAD.g4, t: 'Daily meals', s: 'Fresh dinners from cooks near me' },
  { id: 'prep', ico: 'repeat', grad: GRAD.g7, t: 'Meal-prep the week', s: 'A weekly box, dropped on schedule' },
  { id: 'health', ico: 'leaf', grad: GRAD.g3, t: 'Eat healthier', s: 'High-protein, balanced, fresh' },
  { id: 'family', ico: 'heart', grad: GRAD.g2, t: 'New parent support', s: 'Nourishing meals while you recover and adjust' },
  { id: 'events', ico: 'gift', grad: GRAD.g6, t: 'Events & experiences', s: 'Book a chef, class or supper club' },
];
function Goal({ onNext }: { onNext: () => void }) {
  const c = useC();
  const [goal, setGoal] = useState<string | null>(null);
  return (
    <>
      <Title parts={['What brings you to ', { g: 'Preppa' }, '?']} />
      <Lead>Pick your main goal — we’ll tune your feed from minute one.</Lead>
      <View style={{ marginTop: 14, gap: 11 }}>
        {GOALS.map((g) => {
          const on = goal === g.id;
          return (
            <Press key={g.id} scale={0.98} onPress={() => setGoal(g.id)}>
              <View style={[stt.goal, { backgroundColor: c.surface, borderColor: on ? c.primary : c.border2 }, on ? shadow.card : null]}>
                <GradBox grad={g.grad as any} style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}><Icon name={g.ico} size={21} color="#fff" /></GradBox>
                <View style={{ flex: 1 }}>
                  <Text style={[type(15.5, 800), { color: c.ink }]}>{g.t}</Text>
                  <Text style={[type(12.5, 500), { color: c.soft, marginTop: 2 }]}>{g.s}</Text>
                </View>
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? c.primary : c.border2, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on ? <Icon name="check" size={13} color="#fff" /> : null}</View>
              </View>
            </Press>
          );
        })}
      </View>
      <View style={{ flex: 1, minHeight: 20 }} />
      <Btn label="Continue" iconRight="arrow" disabled={!goal} onPress={onNext} block lg />
    </>
  );
}

const CUIS = ['Italian', 'West African', 'Halal', 'Mexican', 'Soul food', 'Desi', 'Healthy', 'Seafood', 'Vegan', 'BBQ', 'Desserts', 'Comfort'];
function Cuisine({ onNext }: { onNext: () => void }) {
  const c = useC();
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (x: string) => setSel((p) => (p.includes(x) ? p.filter((y) => y !== x) : [...p, x]));
  return (
    <>
      <Title parts={['What do you ', { g: 'love' }, ' to eat?']} />
      <Lead>Choose a few cuisines. You can change these anytime.</Lead>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 20 }}>
        {CUIS.map((x) => {
          const on = sel.includes(x);
          return (
            <Press key={x} scale={0.94} onPress={() => toggle(x)}>
              <View style={[stt.cuis, { backgroundColor: on ? c.primaryL : c.surface, borderColor: on ? c.primaryL : c.border2 }]}>
                <Text style={[type(14, on ? 800 : 700), { color: on ? c.accentText : c.ink }]}>{x}</Text>
              </View>
            </Press>
          );
        })}
      </View>
      <View style={{ flex: 1, minHeight: 20 }} />
      <Btn label={sel.length ? `Start exploring · ${sel.length} picked` : 'Start exploring'} onPress={onNext} block lg />
    </>
  );
}

const FIN = ['Personalizing your feed', 'Finding verified cooks nearby', 'Securing your account'];
function Finish({ onDone }: { onDone: () => void }) {
  const c = useC();
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    // Progress the setup checklist, then finish. This is the last step after the
    // session is already established (OTP verified) — no network call happens here,
    // so it must never fake a failure or stall.
    if (idx >= FIN.length) { const t = setTimeout(onDone, 700); return () => clearTimeout(t); }
    const t = setTimeout(() => setIdx((i) => i + 1), 950);
    return () => clearTimeout(t);
  }, [idx]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Mark size={64} iconSize={32} />
      <Text style={[type(26, 900), { color: c.ink, letterSpacing: -1, marginTop: 22 }]}>Setting up your kitchen…</Text>
      <View style={{ marginTop: 30, maxWidth: 300, gap: 15, width: '100%', paddingHorizontal: 20 }}>
        {FIN.map((s, i) => {
          const done = i < idx, live = i === idx;
          return (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.green : c.bg2, borderWidth: !done && !live ? 1 : 0, borderColor: c.border }}>
                {done ? <Icon name="check" size={14} color="#fff" /> : live ? <Spinner size={14} color={c.primaryD} track={c.border} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.border2 }} />}
              </View>
              <Text style={[type(14.5, 700), { color: done || live ? c.ink : c.muted }]}>{s}{done ? ' ✓' : ''}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function OnboardingFlow() {
  const c = useC();
  const { setOnboarded, coords, setLocation, setCoords, setCountry } = useStore();
  // Assistive: the moment the user starts signing in, quietly resolve their location in the
  // background so the app lands already location-aware (nearby cooks, distances) with no
  // separate "set your location" step. Fire-and-forget; runs once; silent on denial.
  const prefetched = useRef(false);
  const prefetchContext = () => {
    if (prefetched.current || coords) return; // once; never override an existing fix
    prefetched.current = true;
    captureCurrentLocation()
      .then((loc) => { setLocation(loc.label); setCoords({ lat: loc.lat, lng: loc.lng }); if (loc.countryCode) setCountry(loc.countryCode); })
      .catch(() => { /* permission denied / unavailable — keep the default, no nag */ });
  };
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('welcome');
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const STEPS = ['auth', 'code', 'goal', 'cuisine'];
  const at = STEPS.indexOf(step);
  const back = ({ auth: 'welcome', code: 'auth', goal: 'code', cuisine: 'goal' } as Record<string, string>)[step];
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => { fade.setValue(0); Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }).start(); }, [step]);
  // Each step rises a few px as it fades in — enough to feel deliberate, never showy. Off under reduced motion.
  const slide = fade.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 12, 0] });
  const showTop = step !== 'welcome' && step !== 'finish';
  const canSkip = step === 'goal' || step === 'cuisine';
  return (
    <View style={[FILL, { zIndex: 300, backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingTop: insets.top + 10, paddingBottom: insets.bottom + 26, paddingHorizontal: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {showTop ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 42 }}>
            <Press scale={0.9} onPress={() => setStep(back)} label="Back"><View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}><Icon name="chevLeft" size={20} color={c.ink} /></View></Press>
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>{STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= at ? c.primary : c.border2 }} />)}</View>
            {canSkip ? <Pressable onPress={() => setStep('finish')} accessibilityRole="button"><Text style={[type(14, 700), { color: c.soft }]}>Skip</Text></Pressable> : <View style={{ width: 30 }} />}
          </View>
        ) : null}
        <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateY: slide }] }}>
          {step === 'welcome' && <Welcome go={(s, m) => { setMode(m); setStep(s); prefetchContext(); }} />}
          {step === 'auth' && <Auth mode={mode} onNext={(e, authed) => { setRecoveryPassword(''); setEmail(e); setStep(authed ? (mode === 'signin' ? 'finish' : 'goal') : 'code'); }} onRecovery={(e, p) => { setEmail(e); setRecoveryPassword(p); setStep('code'); }} />}
          {step === 'code' && <Code email={email} newPassword={recoveryPassword || undefined} onNext={() => setStep(mode === 'signin' ? 'finish' : 'goal')} />}
          {step === 'goal' && <Goal onNext={() => setStep('cuisine')} />}
          {step === 'cuisine' && <Cuisine onNext={() => setStep('finish')} />}
          {step === 'finish' && <Finish onDone={() => setOnboarded(true)} />}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const stt = StyleSheet.create({
  goal: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15, borderRadius: radius.xl, borderWidth: 1.5 },
  cuis: { height: 42, paddingHorizontal: 17, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
