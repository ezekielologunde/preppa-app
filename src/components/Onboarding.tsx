import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore } from '../store/store';
import { sendEmailOtp, verifyEmailOtp } from '../lib/supabase';
import { Icon } from '../ui/Icon';
import { Press, GradBox } from '../ui/primitives';
import { type, GRAD, shadow, FILL } from '../theme/theme';

const W = (o: number) => `rgba(255,255,255,${o})`;

/* soft brand glow background */
function Glow() {
  return (
    <Svg style={FILL}>
      <Defs>
        <RadialGradient id="o" cx="12%" cy="10%" r="60%">
          <Stop offset="0" stopColor="#F26B1D" stopOpacity="0.32" />
          <Stop offset="1" stopColor="#F26B1D" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="p" cx="92%" cy="92%" r="60%">
          <Stop offset="0" stopColor="#7C3AED" stopOpacity="0.24" />
          <Stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#o)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#p)" />
    </Svg>
  );
}

function Spinner({ size = 19 }: { size?: number }) {
  const r = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(r, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true })).start();
  }, [r]);
  const spin = r.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor: W(0.3), borderTopColor: '#fff', transform: [{ rotate: spin }] }} />;
}

function Title({ parts }: { parts: (string | { g: string })[] }) {
  return (
    <Text style={[type(34, 900), { color: '#fff', letterSpacing: -1.5, lineHeight: 37, marginTop: 18 }]}>
      {parts.map((p, i) => (typeof p === 'string' ? p : <Text key={i} style={{ color: '#FF8A4C' }}>{p.g}</Text>))}
    </Text>
  );
}
function Lead({ children }: { children: React.ReactNode }) {
  return <Text style={[type(15.5, 500), { color: W(0.62), lineHeight: 24, marginTop: 14, maxWidth: 320 }]}>{children}</Text>;
}

function ObtnPri({ label, icon, iconRight, onPress, disabled, busyLabel, busy }: { label: string; icon?: string; iconRight?: string; onPress?: () => void; disabled?: boolean; busyLabel?: string; busy?: boolean }) {
  return (
    <Press scale={0.97} onPress={disabled || busy ? undefined : onPress} style={{ opacity: disabled ? 0.45 : 1 }}>
      <LinearGradient colors={GRAD.g4 as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[stt.obtn, shadow.brand]}>
        {busy ? <Spinner /> : icon ? <Icon name={icon} size={18} color="#fff" /> : null}
        <Text style={[type(16, 800), { color: '#fff' }]}>{busy ? busyLabel : label}</Text>
        {!busy && iconRight ? <Icon name={iconRight} size={18} color="#fff" /> : null}
      </LinearGradient>
    </Press>
  );
}
function ObtnGlass({ label, icon, onPress }: { label: string; icon?: string; onPress?: () => void }) {
  return (
    <Press scale={0.97} onPress={onPress}>
      <View style={[stt.obtn, { backgroundColor: W(0.08), borderWidth: 1, borderColor: W(0.12) }]}>
        {icon ? <Icon name={icon} size={18} color="#fff" /> : null}
        <Text style={[type(16, 800), { color: '#fff' }]}>{label}</Text>
      </View>
    </Press>
  );
}

/* ---------- steps ---------- */
function Welcome({ go }: { go: (s: string, m: 'signin' | 'signup') => void }) {
  return (
    <>
      <View style={{ flex: 0.5 }} />
      <View style={{ height: 190, position: 'relative' }}>
        <Orb grad={GRAD.g4} size={120} style={{ left: '8%', top: 12 }} tag="Maria’s lasagna · 1.2 km" delay={0} />
        <Orb grad={GRAD.g7} size={86} style={{ right: '14%', top: 0 }} tag="Live now 🔥" delay={1200} />
        <Orb grad={GRAD.g3} size={64} style={{ right: '30%', bottom: 4 }} tag="4.9 ★" delay={2300} />
      </View>
      <View style={[stt.mark, shadow.brand]}><Icon name="flame" size={38} color="#fff" /></View>
      <Title parts={['Real food from ', { g: 'real local cooks.' }]} />
      <Lead>Homemade meals, private chefs, weekly boxes and more — from verified neighbors who love to cook.</Lead>
      <View style={{ flex: 1 }} />
      <ObtnPri label="Create account" onPress={() => go('auth', 'signup')} />
      <View style={{ height: 10 }} />
      <ObtnGlass label="Sign in" onPress={() => go('auth', 'signin')} />
      <Text style={[type(11.5, 600), { color: W(0.35), textAlign: 'center', marginTop: 14 }]}>By continuing you agree to Preppa’s Terms & Food Safety Standards.</Text>
    </>
  );
}

function Orb({ grad, size, style, tag, delay }: { grad: readonly string[]; size: number; style: any; tag: string; delay: number }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(y, { toValue: -12, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const t = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(t); loop.stop(); };
  }, [y, delay]);
  return (
    <Animated.View style={[{ position: 'absolute', transform: [{ translateY: y }] }, style]}>
      <GradBox grad={grad as any} style={{ width: size, height: size, borderRadius: size / 2, ...shadow.float }} />
      <View style={{ position: 'absolute', bottom: -10, alignSelf: 'center', backgroundColor: W(0.94), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text style={[type(10.5, 900), { color: '#151210' }]}>{tag}</Text>
      </View>
    </Animated.View>
  );
}

function Auth({ mode, onNext }: { mode: 'signin' | 'signup'; onNext: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shake = useShake();
  const submit = async () => {
    if (busy) return;
    const addr = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(addr)) { setErr('That doesn’t look like an email — check for typos.'); shake.fire(); return; }
    setErr(null); setBusy(true);
    try {
      await sendEmailOtp(addr);
      setBusy(false);
      onNext(addr);
    } catch (e: any) {
      setBusy(false);
      setErr(e?.message || 'Couldn’t send your code just now — please try again.');
      shake.fire();
    }
  };
  return (
    <>
      <Title parts={[mode === 'signin' ? 'Welcome back.' : 'Create your account.']} />
      <Lead>{mode === 'signin' ? 'Enter your email and we’ll send a sign-in code.' : 'Enter your email — we’ll send a code to get you cooking.'}</Lead>
      <Animated.View style={{ marginTop: 26, transform: [{ translateX: shake.x }] }}>
        <Text style={[type(12.5, 800), { color: W(0.55), marginBottom: 8 }]}>Email address</Text>
        <TextInput
          value={email}
          onChangeText={(t) => { setEmail(t); if (err) setErr(null); }}
          onSubmitEditing={submit}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="you@example.com"
          placeholderTextColor={W(0.3)}
          style={[stt.input, err ? { borderColor: '#F87171' } : null]}
        />
        {err ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 }}><Icon name="info" size={15} color="#FCA5A5" /><Text style={[type(13, 700), { color: '#FCA5A5' }]}>{err}</Text></View> : null}
      </Animated.View>
      <View style={{ flex: 1, minHeight: 24 }} />
      <ObtnPri label="Continue" iconRight="arrow" busy={busy} busyLabel="Sending code…" onPress={submit} />
    </>
  );
}

function Code({ email, onNext }: { email: string; onNext: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [cool, setCool] = useState(0);
  const [resent, setResent] = useState(false);
  const ref = useRef<TextInput>(null);
  const shake = useShake();
  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 300); return () => clearTimeout(t); }, []);
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool((c) => c - 1), 1000); return () => clearTimeout(t); }, [cool]);
  useEffect(() => {
    // NB: depend on `code` only. If `busy` were a dep, flipping it in setBusy(true)
    // would re-run this effect and cancel the in-flight verify before it resolves.
    if (code.length !== 6 || busy) return;
    setBusy(true);
    let cancelled = false;
    verifyEmailOtp(email, code)
      .then(() => { if (!cancelled) onNext(); })
      .catch(() => { if (!cancelled) { setBusy(false); setErr(true); shake.fire(); setCode(''); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const resend = () => { setCool(24); setResent(true); setErr(false); sendEmailOtp(email).catch(() => {}); setTimeout(() => setResent(false), 2400); };
  return (
    <>
      <Title parts={['Check your inbox.']} />
      <Lead>We sent a 6-digit code to <Text style={{ color: '#fff', fontFamily: type(15.5, 700).fontFamily }}>{email}</Text>.</Lead>
      <Animated.View style={{ flexDirection: 'row', gap: 9, marginTop: 22, transform: [{ translateX: shake.x }] }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const live = i === code.length && !busy;
          return (
            <View key={i} style={[stt.otpBox, err ? { borderColor: '#F87171' } : live ? { borderColor: '#F26B1D' } : null]}>
              <Text style={[type(23, 900), { color: '#fff' }]}>{code[i] || ''}</Text>
            </View>
          );
        })}
        <TextInput
          ref={ref}
          value={code}
          onChangeText={(t) => { setCode(t.replace(/\D/g, '').slice(0, 6)); if (err) setErr(false); }}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          caretHidden
          selectionColor="transparent"
          style={[FILL, { color: 'transparent', fontSize: 24, textAlign: 'center' }] as any}
        />
      </Animated.View>
      {err ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}><Icon name="info" size={15} color="#FCA5A5" /><Text style={[type(13, 700), { color: '#FCA5A5' }]}>That code didn’t match. Check the digits and try again.</Text></View> : null}
      {busy ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}><Spinner size={15} /><Text style={[type(13, 700), { color: W(0.6) }]}>Verifying…</Text></View> : null}
      <View style={{ flex: 1, minHeight: 24 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 4 }}>
        <Text style={[type(14, 600), { color: W(0.45) }]}>{resent ? 'Code re-sent ✓' : 'Didn’t get it?'}</Text>
        {!resent ? <Pressable disabled={cool > 0} onPress={resend}><Text style={[type(14, 800), { color: cool > 0 ? W(0.35) : '#F26B1D' }]}>{cool > 0 ? `Resend in ${cool}s` : 'Resend code'}</Text></Pressable> : null}
      </View>
    </>
  );
}

const GOALS = [
  { id: 'daily', ico: 'home', grad: GRAD.g4, t: 'Daily meals', s: 'Fresh dinners from cooks near me' },
  { id: 'prep', ico: 'repeat', grad: GRAD.g7, t: 'Meal-prep the week', s: 'A weekly box, dropped on schedule' },
  { id: 'health', ico: 'leaf', grad: GRAD.g3, t: 'Eat healthier', s: 'High-protein, balanced, fresh' },
  { id: 'events', ico: 'gift', grad: GRAD.g6, t: 'Events & experiences', s: 'Book a chef, class or supper club' },
];
function Goal({ onNext }: { onNext: () => void }) {
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
              <View style={[stt.goal, on ? { borderColor: '#F26B1D', backgroundColor: 'rgba(242,107,29,.14)' } : null]}>
                <GradBox grad={g.grad as any} style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}><Icon name={g.ico} size={21} color="#fff" /></GradBox>
                <View style={{ flex: 1 }}>
                  <Text style={[type(15.5, 800), { color: '#fff' }]}>{g.t}</Text>
                  <Text style={[type(12.5, 500), { color: W(0.55), marginTop: 2 }]}>{g.s}</Text>
                </View>
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? '#F26B1D' : W(0.2), backgroundColor: on ? '#F26B1D' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on ? <Icon name="check" size={13} color="#fff" /> : null}</View>
              </View>
            </Press>
          );
        })}
      </View>
      <View style={{ flex: 1, minHeight: 20 }} />
      <ObtnPri label="Continue" iconRight="arrow" disabled={!goal} onPress={onNext} />
    </>
  );
}

const CUIS = ['Italian', 'West African', 'Halal', 'Mexican', 'Soul food', 'Desi', 'Healthy', 'Seafood', 'Vegan', 'BBQ', 'Desserts', 'Comfort'];
function Cuisine({ onNext }: { onNext: () => void }) {
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
              {on ? (
                <LinearGradient colors={GRAD.g4 as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={stt.cuisOn}><Text style={[type(14, 800), { color: '#fff' }]}>{x}</Text></LinearGradient>
              ) : (
                <View style={stt.cuis}><Text style={[type(14, 700), { color: '#fff' }]}>{x}</Text></View>
              )}
            </Press>
          );
        })}
      </View>
      <View style={{ flex: 1, minHeight: 20 }} />
      <ObtnPri label={sel.length ? `Start exploring · ${sel.length} picked` : 'Start exploring'} onPress={onNext} />
    </>
  );
}

const FIN = ['Personalizing your feed', 'Finding verified cooks nearby', 'Securing your account'];
function Finish({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);
  useEffect(() => {
    if (failed) return;
    if (idx >= FIN.length) { const t = setTimeout(onDone, 700); return () => clearTimeout(t); }
    const t = setTimeout(() => {
      if (idx === 2 && !tried.current) { tried.current = true; setFailed(true); }
      else setIdx((i) => i + 1);
    }, 950);
    return () => clearTimeout(t);
  }, [idx, failed]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[stt.mark, { width: 64, height: 64, borderRadius: 20 }, shadow.brand]}><Icon name="flame" size={32} color="#fff" /></View>
      <Text style={[type(26, 900), { color: '#fff', letterSpacing: -1, marginTop: 22 }]}>Setting up your kitchen…</Text>
      <View style={{ marginTop: 30, maxWidth: 300, gap: 15, width: '100%', paddingHorizontal: 20 }}>
        {FIN.map((s, i) => {
          const done = i < idx, live = i === idx && !failed, fail = i === idx && failed;
          return (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#16A34A' : fail ? 'rgba(248,113,113,.2)' : W(0.08), borderWidth: fail || (!done && !live) ? 1 : 0, borderColor: fail ? '#F87171' : W(0.12) }}>
                {done ? <Icon name="check" size={14} color="#fff" /> : fail ? <Icon name="x" size={14} color="#FCA5A5" /> : live ? <Spinner size={14} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: W(0.3) }} />}
              </View>
              <Text style={[type(14.5, 700), { color: done || live || fail ? '#fff' : W(0.4) }]}>{s}{done ? ' ✓' : ''}</Text>
            </View>
          );
        })}
      </View>
      {failed ? (
        <View style={{ marginTop: 22, maxWidth: 300, padding: 16, borderRadius: 16, backgroundColor: 'rgba(248,113,113,.1)', borderWidth: 1.5, borderColor: 'rgba(248,113,113,.35)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="info" size={16} color="#FCA5A5" /><Text style={[type(14, 800), { color: '#FCA5A5' }]}>Connection hiccup</Text></View>
          <Text style={[type(12.5, 600), { color: W(0.55), marginTop: 6, lineHeight: 18 }]}>We couldn’t reach the server just now. Your progress is saved — try again.</Text>
          <Press scale={0.97} onPress={() => setFailed(false)} style={{ marginTop: 12 }}>
            <View style={[stt.obtn, { height: 44, backgroundColor: W(0.08), borderWidth: 1, borderColor: W(0.12) }]}><Icon name="repeat" size={16} color="#fff" /><Text style={[type(14.5, 800), { color: '#fff' }]}>Retry</Text></View>
          </Press>
        </View>
      ) : null}
    </View>
  );
}

function useShake() {
  const x = useRef(new Animated.Value(0)).current;
  const fire = () => {
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

export function OnboardingFlow() {
  const { setOnboarded } = useStore();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('welcome');
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const STEPS = ['auth', 'code', 'goal', 'cuisine'];
  const at = STEPS.indexOf(step);
  const back = ({ auth: 'welcome', code: 'auth', goal: 'code', cuisine: 'goal' } as Record<string, string>)[step];
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => { fade.setValue(0); Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start(); }, [step]);
  const showTop = step !== 'welcome' && step !== 'finish';
  const canSkip = step === 'goal' || step === 'cuisine';
  return (
    <View style={[FILL, { backgroundColor: '#100D0A', zIndex: 300 }]}>
      <Glow />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 26, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled">
        {showTop ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 42 }}>
            <Press scale={0.9} onPress={() => setStep(back)}><View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: W(0.08), borderWidth: 1, borderColor: W(0.12), alignItems: 'center', justifyContent: 'center' }}><Icon name="chevLeft" size={20} color="#fff" /></View></Press>
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>{STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= at ? '#F26B1D' : W(0.12) }} />)}</View>
            {canSkip ? <Pressable onPress={() => setStep('finish')}><Text style={[type(14, 700), { color: W(0.55) }]}>Skip</Text></Pressable> : <View style={{ width: 30 }} />}
          </View>
        ) : null}
        <Animated.View style={{ flex: 1, opacity: fade }}>
          {step === 'welcome' && <Welcome go={(s, m) => { setMode(m); setStep(s); }} />}
          {step === 'auth' && <Auth mode={mode} onNext={(e) => { setEmail(e); setStep('code'); }} />}
          {step === 'code' && <Code email={email} onNext={() => setStep(mode === 'signin' ? 'finish' : 'goal')} />}
          {step === 'goal' && <Goal onNext={() => setStep('cuisine')} />}
          {step === 'cuisine' && <Cuisine onNext={() => setStep('finish')} />}
          {step === 'finish' && <Finish onDone={() => setOnboarded(true)} />}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const stt = StyleSheet.create({
  obtn: { height: 56, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  mark: { width: 74, height: 74, borderRadius: 24, backgroundColor: '#F26B1D', alignItems: 'center', justifyContent: 'center' },
  input: { height: 56, borderRadius: 16, paddingHorizontal: 18, backgroundColor: W(0.07), borderWidth: 1.5, borderColor: W(0.12), color: '#fff', fontFamily: type(16, 600).fontFamily, fontSize: 16 },
  otpBox: { flex: 1, height: 60, borderRadius: 15, backgroundColor: W(0.07), borderWidth: 1.5, borderColor: W(0.12), alignItems: 'center', justifyContent: 'center' },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15, borderRadius: 18, backgroundColor: W(0.06), borderWidth: 1.5, borderColor: W(0.1) },
  cuis: { height: 42, paddingHorizontal: 17, borderRadius: 999, backgroundColor: W(0.07), borderWidth: 1, borderColor: W(0.12), alignItems: 'center', justifyContent: 'center' },
  cuisOn: { height: 42, paddingHorizontal: 17, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
