import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore } from '../store/store';
import { sendEmailOtp, verifyEmailOtp, signUpWithPassword, signInWithPassword, AUTH_TIMEOUT_MESSAGE } from '../lib/supabase';
import { Icon } from '../ui/Icon';
import { Press, GradBox } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import { type, GRAD, shadow, FILL } from '../theme/theme';

const W = (o: number) => `rgba(255,255,255,${o})`;
/** On-gradient accent — the brand orange itself would blend into the GRAD.g4
 * background these screens now sit on, so active/selected states use white instead. */
const ACCENT = '#fff';

function Spinner({ size = 19, color = '#fff' }: { size?: number; color?: string }) {
  const r = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    Animated.loop(Animated.timing(r, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true })).start();
  }, [r, reduced]);
  const spin = r.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const trackColor = color === '#fff' ? W(0.3) : 'rgba(242,107,29,.25)';
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor: trackColor, borderTopColor: color, transform: [{ rotate: spin }] }} />;
}

function Title({ parts }: { parts: (string | { g: string })[] }) {
  return (
    <Text style={[type(34, 900), { color: '#fff', letterSpacing: -1.5, lineHeight: 37, marginTop: 18 }]}>
      {/* Highlight is warm cream, not brand orange — orange-on-orange (the GRAD.g4
          background these screens sit on) would be invisible. */}
      {parts.map((p, i) => (typeof p === 'string' ? p : <Text key={i} style={{ color: '#FFE29A' }}>{p.g}</Text>))}
    </Text>
  );
}
function Lead({ children }: { children: React.ReactNode }) {
  return <Text style={[type(15.5, 500), { color: W(0.62), lineHeight: 24, marginTop: 14, maxWidth: 320 }]}>{children}</Text>;
}

/* Solid white, not the GRAD.g4 gradient — these screens now sit ON that same
 * gradient, so a same-gradient button would nearly vanish into the background. */
function ObtnPri({ label, icon, iconRight, onPress, disabled, busyLabel, busy }: { label: string; icon?: string; iconRight?: string; onPress?: () => void; disabled?: boolean; busyLabel?: string; busy?: boolean }) {
  return (
    <Press scale={0.97} onPress={disabled || busy ? undefined : onPress} style={{ opacity: disabled ? 0.45 : 1 }}>
      <View style={[stt.obtn, { backgroundColor: '#fff' }, shadow.card]}>
        {busy ? <Spinner color="#E24A38" /> : icon ? <Icon name={icon} size={18} color="#E24A38" /> : null}
        <Text style={[type(16, 800), { color: '#E24A38' }]}>{busy ? busyLabel : label}</Text>
        {!busy && iconRight ? <Icon name={iconRight} size={18} color="#E24A38" /> : null}
      </View>
    </Press>
  );
}
/* ---------- steps ---------- */
function JoiningPill() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 10, backgroundColor: W(0.14), borderWidth: 1, borderColor: W(0.2), borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, marginTop: 22 }}>
      <View style={{ flexDirection: 'row' }}>
        {[GRAD.g3, GRAD.g7, GRAD.g6].map((g, i) => (
          <GradBox key={i} grad={g as any} style={{ width: 22, height: 22, borderRadius: 11, marginLeft: i === 0 ? 0 : -8, borderWidth: 2, borderColor: 'rgba(255,255,255,.4)' }} />
        ))}
      </View>
      <Text style={[type(12.5, 800), { color: '#fff' }]}>Local Preppas joining every week</Text>
    </View>
  );
}

function Welcome({ go }: { go: (s: string, m: 'signin' | 'signup') => void }) {
  return (
    <>
      <View style={{ flex: 0.6 }} />
      <View style={[stt.mark, shadow.brand]}><Icon name="flame" size={38} color="#fff" /></View>
      <Text style={[type(28, 900), { color: '#fff', letterSpacing: -1, marginTop: 16 }]}>preppa</Text>
      <Title parts={['Real food from real local ', { g: 'Preppas' }, ' near you.']} />
      <Lead>Homemade meals, private chefs, weekly boxes and more — from verified neighbors who love to cook.</Lead>
      <JoiningPill />
      <View style={{ flex: 1 }} />
      <ObtnPri label="Get Started — It's Free" onPress={() => go('auth', 'signup')} />
      <Pressable onPress={() => go('auth', 'signin')} style={{ marginTop: 16, alignSelf: 'center' }}>
        <Text style={[type(14, 700), { color: W(0.85) }]}>Already a member? <Text style={{ textDecorationLine: 'underline' }}>Sign in →</Text></Text>
      </Pressable>
      <Text style={[type(11.5, 600), { color: W(0.5), textAlign: 'center', marginTop: 14 }]}>By continuing you agree to Preppa’s Terms & Food Safety Standards.</Text>
    </>
  );
}

function Auth({ mode, onNext }: { mode: 'signin' | 'signup'; onNext: (email: string, authed: boolean) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const shake = useShake();

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const clearMsgs = () => { if (err) setErr(null); if (info) setInfo(null); };

  // Primary path: email + password → session directly (no code to copy).
  const submit = async () => {
    if (busy || codeBusy) return;
    const addr = email.trim();
    const nm = fullName.trim();
    if (mode === 'signup' && nm.length < 2) { setErr('Please enter your name.'); shake.fire(); return; }
    if (!validEmail) { setErr('That doesn’t look like an email — check for typos.'); shake.fire(); return; }
    if (password.length < 8) { setErr('Use a password of at least 8 characters.'); shake.fire(); return; }
    setErr(null); setInfo(null); setBusy(true);
    try {
      if (mode === 'signup') {
        const session = await signUpWithPassword(addr, password, { display_name: nm, first_name: nm.split(/\s+/)[0] });
        setBusy(false);
        if (session) onNext(addr, true);
        else setInfo(`We sent a confirmation link to ${addr}. Tap it, then sign in.`);
      } else {
        await signInWithPassword(addr, password);
        setBusy(false);
        onNext(addr, true);
      }
    } catch (e: any) {
      setBusy(false);
      const msg = e?.message === AUTH_TIMEOUT_MESSAGE
        ? e.message
        : mode === 'signin'
          ? 'Wrong email or password. Try again, or email yourself a code.'
          : (typeof e?.message === 'string' && e.message.toLowerCase().includes('already'))
            ? 'That email already has an account — sign in instead.'
            : 'Couldn’t create your account — please try again.';
      setErr(msg); shake.fire();
    }
  };

  // Fallback: passwordless — email a 6-digit sign-in code (the old flow).
  const emailCode = async () => {
    if (busy || codeBusy) return;
    const addr = email.trim();
    const nm = fullName.trim();
    if (mode === 'signup' && nm.length < 2) { setErr('Please enter your name.'); shake.fire(); return; }
    if (!validEmail) { setErr('That doesn’t look like an email — check for typos.'); shake.fire(); return; }
    setErr(null); setInfo(null); setCodeBusy(true);
    try {
      await sendEmailOtp(addr, mode === 'signup' ? { display_name: nm, first_name: nm.split(/\s+/)[0] } : undefined);
      setCodeBusy(false);
      onNext(addr, false);
    } catch (e: any) {
      setCodeBusy(false);
      setErr(e?.message || 'Couldn’t send your code just now — please try again.');
      shake.fire();
    }
  };

  return (
    <>
      <Title parts={[mode === 'signin' ? 'Welcome back.' : 'Create your account.']} />
      <Lead>{mode === 'signin' ? 'Sign in with your email and password.' : 'A couple details and you’re in — your password lets you skip codes next time.'}</Lead>
      <Animated.View style={{ marginTop: 24, transform: [{ translateX: shake.x }] }}>
        {mode === 'signup' ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={[type(12.5, 800), { color: W(0.55), marginBottom: 8 }]}>Full name</Text>
            <TextInput value={fullName} onChangeText={(t) => { setFullName(t); clearMsgs(); }} autoCapitalize="words" autoComplete="name" textContentType="name" placeholder="Your name" placeholderTextColor={W(0.3)} style={stt.input} />
          </View>
        ) : null}
        <Text style={[type(12.5, 800), { color: W(0.55), marginBottom: 8 }]}>Email address</Text>
        <TextInput value={email} onChangeText={(t) => { setEmail(t); clearMsgs(); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" placeholderTextColor={W(0.3)} style={[stt.input, err ? { borderColor: '#F87171' } : null]} />
        <View style={{ height: 14 }} />
        <Text style={[type(12.5, 800), { color: W(0.55), marginBottom: 8 }]}>Password</Text>
        <TextInput value={password} onChangeText={(t) => { setPassword(t); clearMsgs(); }} onSubmitEditing={submit} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signup' ? 'password-new' : 'password'} textContentType={mode === 'signup' ? 'newPassword' : 'password'} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} placeholderTextColor={W(0.3)} style={[stt.input, err ? { borderColor: '#F87171' } : null]} />
        {err ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 }}><Icon name="info" size={15} color="#FCA5A5" /><Text style={[type(13, 700), { color: '#FCA5A5', flex: 1 }]}>{err}</Text></View> : null}
        {info ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 }}><Icon name="check" size={15} color="#86EFAC" /><Text style={[type(13, 700), { color: '#86EFAC', flex: 1 }]}>{info}</Text></View> : null}
      </Animated.View>
      <View style={{ flex: 1, minHeight: 24 }} />
      <ObtnPri label={mode === 'signin' ? 'Sign in' : 'Create account'} iconRight="arrow" busy={busy} busyLabel={mode === 'signin' ? 'Signing in…' : 'Creating…'} onPress={submit} />
      <Pressable onPress={emailCode} style={{ marginTop: 16, alignSelf: 'center' }}>
        <Text style={[type(13.5, 700), { color: W(0.6) }]}>{codeBusy ? 'Sending code…' : 'Email me a sign-in code instead'}</Text>
      </Pressable>
    </>
  );
}

function Code({ email, onNext }: { email: string; onNext: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
      .catch((e: any) => {
        if (cancelled) return;
        setBusy(false);
        // A stalled network surfaces the timeout message; anything else is a bad code.
        setErr(e?.message === AUTH_TIMEOUT_MESSAGE ? e.message : 'That code didn’t match. Check the digits and try again.');
        shake.fire();
        setCode('');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const resend = () => { setCool(24); setResent(true); setErr(null); sendEmailOtp(email).catch(() => {}); setTimeout(() => setResent(false), 2400); };
  return (
    <>
      <Title parts={['Check your inbox.']} />
      <Lead>We sent a 6-digit code to <Text style={{ color: '#fff', fontFamily: type(15.5, 700).fontFamily }}>{email}</Text>.</Lead>
      <Animated.View style={{ flexDirection: 'row', gap: 9, marginTop: 22, transform: [{ translateX: shake.x }] }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const live = i === code.length && !busy;
          return (
            <View key={i} style={[stt.otpBox, err ? { borderColor: '#F87171' } : live ? { borderColor: ACCENT } : null]}>
              <Text style={[type(23, 900), { color: '#fff' }]}>{code[i] || ''}</Text>
            </View>
          );
        })}
        <TextInput
          ref={ref}
          value={code}
          onChangeText={(t) => { setCode(t.replace(/\D/g, '').slice(0, 6)); if (err) setErr(null); }}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          caretHidden
          selectionColor="transparent"
          style={[FILL, { color: 'transparent', fontSize: 24, textAlign: 'center' }] as any}
        />
      </Animated.View>
      {err ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}><Icon name="info" size={15} color="#FCA5A5" /><Text style={[type(13, 700), { color: '#FCA5A5' }]}>{err}</Text></View> : null}
      {busy ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}><Spinner size={15} /><Text style={[type(13, 700), { color: W(0.6) }]}>Verifying…</Text></View> : null}
      <View style={{ flex: 1, minHeight: 24 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 4 }}>
        <Text style={[type(14, 600), { color: W(0.45) }]}>{resent ? 'Code re-sent ✓' : 'Didn’t get it?'}</Text>
        {!resent ? <Pressable disabled={cool > 0} onPress={resend}><Text style={[type(14, 800), { color: cool > 0 ? W(0.35) : ACCENT, textDecorationLine: cool > 0 ? 'none' : 'underline' }]}>{cool > 0 ? `Resend in ${cool}s` : 'Resend code'}</Text></Pressable> : null}
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
              <View style={[stt.goal, on ? { borderColor: ACCENT, backgroundColor: 'rgba(255,255,255,.16)' } : null]}>
                <GradBox grad={g.grad as any} style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}><Icon name={g.ico} size={21} color="#fff" /></GradBox>
                <View style={{ flex: 1 }}>
                  <Text style={[type(15.5, 800), { color: '#fff' }]}>{g.t}</Text>
                  <Text style={[type(12.5, 500), { color: W(0.7), marginTop: 2 }]}>{g.s}</Text>
                </View>
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? ACCENT : W(0.3), backgroundColor: on ? ACCENT : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on ? <Icon name="check" size={13} color="#E24A38" /> : null}</View>
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
                <View style={[stt.cuisOn, { backgroundColor: '#fff' }]}><Text style={[type(14, 800), { color: '#E24A38' }]}>{x}</Text></View>
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
      <View style={[stt.mark, { width: 64, height: 64, borderRadius: 20 }, shadow.brand]}><Icon name="flame" size={32} color="#fff" /></View>
      <Text style={[type(26, 900), { color: '#fff', letterSpacing: -1, marginTop: 22 }]}>Setting up your kitchen…</Text>
      <View style={{ marginTop: 30, maxWidth: 300, gap: 15, width: '100%', paddingHorizontal: 20 }}>
        {FIN.map((s, i) => {
          const done = i < idx, live = i === idx;
          return (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#16A34A' : W(0.08), borderWidth: !done && !live ? 1 : 0, borderColor: W(0.12) }}>
                {done ? <Icon name="check" size={14} color="#fff" /> : live ? <Spinner size={14} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: W(0.3) }} />}
              </View>
              <Text style={[type(14.5, 700), { color: done || live ? '#fff' : W(0.4) }]}>{s}{done ? ' ✓' : ''}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function useShake() {
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
    <LinearGradient colors={GRAD.g4 as any} style={[FILL, { zIndex: 300 }]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 26, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled">
        {showTop ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 42 }}>
            <Press scale={0.9} onPress={() => setStep(back)}><View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: W(0.14), borderWidth: 1, borderColor: W(0.2), alignItems: 'center', justifyContent: 'center' }}><Icon name="chevLeft" size={20} color="#fff" /></View></Press>
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>{STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= at ? ACCENT : W(0.2) }} />)}</View>
            {canSkip ? <Pressable onPress={() => setStep('finish')}><Text style={[type(14, 700), { color: W(0.7) }]}>Skip</Text></Pressable> : <View style={{ width: 30 }} />}
          </View>
        ) : null}
        <Animated.View style={{ flex: 1, opacity: fade }}>
          {step === 'welcome' && <Welcome go={(s, m) => { setMode(m); setStep(s); }} />}
          {step === 'auth' && <Auth mode={mode} onNext={(e, authed) => { setEmail(e); setStep(authed ? (mode === 'signin' ? 'finish' : 'goal') : 'code'); }} />}
          {step === 'code' && <Code email={email} onNext={() => setStep(mode === 'signin' ? 'finish' : 'goal')} />}
          {step === 'goal' && <Goal onNext={() => setStep('cuisine')} />}
          {step === 'cuisine' && <Cuisine onNext={() => setStep('finish')} />}
          {step === 'finish' && <Finish onDone={() => setOnboarded(true)} />}
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const stt = StyleSheet.create({
  obtn: { height: 56, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  mark: { width: 74, height: 74, borderRadius: 24, backgroundColor: 'rgba(255,255,255,.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,.3)', alignItems: 'center', justifyContent: 'center' },
  input: { height: 56, borderRadius: 16, paddingHorizontal: 18, backgroundColor: W(0.07), borderWidth: 1.5, borderColor: W(0.12), color: '#fff', fontFamily: type(16, 600).fontFamily, fontSize: 16 },
  otpBox: { flex: 1, height: 60, borderRadius: 15, backgroundColor: W(0.07), borderWidth: 1.5, borderColor: W(0.12), alignItems: 'center', justifyContent: 'center' },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15, borderRadius: 18, backgroundColor: W(0.06), borderWidth: 1.5, borderColor: W(0.1) },
  cuis: { height: 42, paddingHorizontal: 17, borderRadius: 999, backgroundColor: W(0.07), borderWidth: 1, borderColor: W(0.12), alignItems: 'center', justifyContent: 'center' },
  cuisOn: { height: 42, paddingHorizontal: 17, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
