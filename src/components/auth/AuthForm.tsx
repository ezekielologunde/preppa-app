import React, { useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { sendEmailOtp, signUpWithPassword, signInWithPassword, sendPasswordResetOtp, AUTH_TIMEOUT_MESSAGE } from '../../lib/supabase';
import { Icon } from '../../ui/Icon';
import { Btn } from '../../ui/primitives';
import { useC } from '../../theme/ThemeContext';
import { type, radius } from '../../theme/theme';
import { Title, Lead, useShake } from './authUi';

export type ConsentMode = 'none' | 'notice' | 'checkbox';
export type ConsentOption = { mode: ConsentMode; checked: boolean; onChange: (v: boolean) => void };
const CONSENT_TEXT = 'By continuing you agree to the Terms and Privacy Policy.';
const CONSENT_REQUIRED = 'Please agree to the Terms and Privacy Policy to continue.';
const noop = () => {};
// The help-center legal pages (the same URLs as the profile screen's links).
const TERMS_URL = 'https://help.preppa.live/legal/terms';
const PRIVACY_URL = 'https://help.preppa.live/legal/privacy';
// The links sit inside the checkbox row's Pressable: stop the press there so a tap does not also toggle it.
const openLegal = (url: string, e?: { stopPropagation?: () => void }) => {
  e?.stopPropagation?.();
  try {
    Linking.openURL(url).catch(noop);
  } catch {
    // ignored: a link that cannot open leaves the form as it is
  }
};
// Supabase's reply to a recovery code for an address with no account (shouldCreateUser false).
const NO_ACCOUNT = /user[ _]not[ _]found|signups? not allowed|otp_disabled/i;
function isNoAccountError(e: unknown): boolean {
  if (e === null || typeof e !== 'object') return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  return [code, message].some((v) => typeof v === 'string' && NO_ACCOUNT.test(v));
}

// Optional props default to the native behaviour: 8-character passwords, raw messages where they
// are raw today, no consent row, no account-email callback, no neutral notices, and a recovery
// error for an unknown address shows as an error.
export function Auth({ mode, onNext, onRecovery, passwordMin = 8, mapError, mapNotice, neutralRecovery = false, consent, onAccountEmail = noop }: {
  mode: 'signin' | 'signup';
  onNext: (email: string, authed: boolean) => void;
  onRecovery: (email: string, newPassword: string) => void;
  passwordMin?: number;
  mapError?: (err: unknown, ctx?: 'auth' | 'code') => string;
  mapNotice?: (err: unknown) => string | null;
  neutralRecovery?: boolean;
  consent?: ConsentOption;
  onAccountEmail?: (email: string) => void | PromiseLike<unknown>;
}) {
  const c = useC();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const shake = useShake();

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const consentMode: ConsentMode = consent?.mode ?? 'none';
  const showConsent = consentMode !== 'none' && !recovering;
  const consentMissing = consentMode === 'checkbox' && !consent?.checked;
  const clearMsgs = () => { if (err) setErr(null); if (info) setInfo(null); };
  // A throwing or rejecting account-email callback must never block sign-in.
  const tellAccountEmail = (addr: string) => {
    try {
      const r = onAccountEmail(addr);
      if (r && typeof r.then === 'function') r.then(undefined, noop);
    } catch {
      // ignored: the callback is best effort
    }
  };
  // A neutral notice shows as info: no red error, no shake, and the form stays on this step.
  const showNotice = (e: unknown) => {
    const note = mapNotice ? mapNotice(e) : null;
    if (note == null) return false;
    setErr(null); setInfo(note);
    return true;
  };

  // Primary path: email + password → session directly (no code to copy).
  const submit = async () => {
    if (busy || codeBusy) return;
    const addr = email.trim();
    const nm = fullName.trim();
    if (!recovering && mode === 'signup' && nm.length < 2) { setErr('Please enter your name.'); shake.fire(); return; }
    if (!validEmail) { setErr('That doesn’t look like an email \u2014 check for typos.'); shake.fire(); return; }
    if (password.length < passwordMin) { setErr(`Use a password of at least ${passwordMin} characters.`); shake.fire(); return; }
    if (!recovering && consentMissing) { setErr(CONSENT_REQUIRED); shake.fire(); return; }
    tellAccountEmail(addr.toLowerCase());
    setErr(null); setInfo(null); setBusy(true);
    try {
      if (recovering) {
        try {
          await sendPasswordResetOtp(addr);
        } catch (re) {
          // Neutral recovery: an address with no account gets exactly the reply a real one gets.
          if (!(neutralRecovery && isNoAccountError(re))) throw re;
        }
        setBusy(false);
        onRecovery(addr, password);
        return;
      }
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
      if (!recovering && showNotice(e)) return;
      const msg = mapError ? mapError(e) : e?.message === AUTH_TIMEOUT_MESSAGE
        ? e.message
        : recovering
          ? 'Couldn’t send a recovery code. Check the email and try again.'
        : mode === 'signin'
          ? 'Wrong email or password. Try again, or email yourself a code.'
          : (typeof e?.message === 'string' && e.message.toLowerCase().includes('already'))
            ? 'That email already has an account \u2014 sign in instead.'
            : 'Couldn’t create your account \u2014 please try again.';
      setErr(msg); shake.fire();
    }
  };

  // Fallback: passwordless, email a 6-digit sign-in code (the old flow).
  const emailCode = async () => {
    if (busy || codeBusy) return;
    const addr = email.trim();
    const nm = fullName.trim();
    if (mode === 'signup' && nm.length < 2) { setErr('Please enter your name.'); shake.fire(); return; }
    if (!validEmail) { setErr('That doesn’t look like an email \u2014 check for typos.'); shake.fire(); return; }
    if (consentMissing) { setErr(CONSENT_REQUIRED); shake.fire(); return; }
    tellAccountEmail(addr.toLowerCase());
    setErr(null); setInfo(null); setCodeBusy(true);
    try {
      await sendEmailOtp(addr, mode === 'signup' ? { display_name: nm, first_name: nm.split(/\s+/)[0] } : undefined);
      setCodeBusy(false);
      onNext(addr, false);
    } catch (e: any) {
      setCodeBusy(false);
      if (showNotice(e)) return;
      setErr(mapError ? mapError(e) : e?.message || 'Couldn’t send your code just now \u2014 please try again.');
      shake.fire();
    }
  };

  // CONSENT_TEXT with "Terms" and "Privacy Policy" as links.
  const consentLine = (
    <>
      By continuing you agree to the <Text accessibilityRole="link" onPress={(e) => openLegal(TERMS_URL, e)} style={{ color: c.primary, textDecorationLine: 'underline' }}>Terms</Text> and <Text accessibilityRole="link" onPress={(e) => openLegal(PRIVACY_URL, e)} style={{ color: c.primary, textDecorationLine: 'underline' }}>Privacy Policy</Text>.
    </>
  );
  const inputStyle = (hasErr: boolean) => [stt.input, { backgroundColor: c.surface, borderColor: hasErr ? c.red : c.border, color: c.ink }];

  return (
    <>
      <Title parts={[recovering ? 'Reset your password.' : mode === 'signin' ? 'Welcome back.' : 'Create your account.']} />
      <Lead>{recovering ? 'Choose a new password. We’ll email a code to confirm it’s you.' : mode === 'signin' ? 'Sign in with your email and password.' : 'A couple details and you’re in \u2014 your password lets you skip codes next time.'}</Lead>
      <Animated.View style={{ marginTop: 24, transform: [{ translateX: shake.x }] }}>
        {mode === 'signup' && !recovering ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={[type(12.5, 800), { color: c.soft, marginBottom: 8 }]}>Full name</Text>
      <TextInput value={fullName} onChangeText={(t) => { setFullName(t); clearMsgs(); }} autoCapitalize="words" autoComplete="name" textContentType="name" placeholder="Your name" placeholderTextColor={c.muted} accessibilityLabel="Your name" style={inputStyle(false)} />
          </View>
        ) : null}
        <Text style={[type(12.5, 800), { color: c.soft, marginBottom: 8 }]}>Email address</Text>
      <TextInput value={email} onChangeText={(t) => { setEmail(t); clearMsgs(); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" placeholderTextColor={c.muted} accessibilityLabel="Email address" style={inputStyle(!!err)} />
        <View style={{ height: 14 }} />
        <Text style={[type(12.5, 800), { color: c.soft, marginBottom: 8 }]}>{recovering ? 'New password' : 'Password'}</Text>
      <TextInput value={password} onChangeText={(t) => { setPassword(t); clearMsgs(); }} onSubmitEditing={submit} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signup' || recovering ? 'password-new' : 'password'} textContentType={mode === 'signup' || recovering ? 'newPassword' : 'password'} placeholder={mode === 'signup' || recovering ? `At least ${passwordMin} characters` : 'Your password'} placeholderTextColor={c.muted} accessibilityLabel={recovering ? 'New password' : 'Password'} style={inputStyle(!!err)} />
      {mode === 'signin' ? <Pressable onPress={() => { setRecovering((v) => !v); setErr(null); setInfo(null); setPassword(''); }} accessibilityRole="button" style={{ marginTop: 11, alignSelf: 'flex-end' }}><Text style={[type(13, 700), { color: c.primary }]}>{recovering ? 'Back to sign in' : 'Forgot password?'}</Text></Pressable> : null}
        {showConsent && consentMode === 'notice' ? <Text style={[type(12.5, 600), { color: c.soft, marginTop: 14 }]}>{consentLine}</Text> : null}
        {showConsent && consentMode === 'checkbox' ? (
          <Pressable onPress={() => { if (consent) consent.onChange(!consent.checked); clearMsgs(); }} accessibilityRole="checkbox" accessibilityState={{ checked: !!consent?.checked }} accessibilityLabel={CONSENT_TEXT} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: err === CONSENT_REQUIRED ? c.red : c.border, backgroundColor: consent?.checked ? c.primary : c.surface, alignItems: 'center', justifyContent: 'center' }}>
              {consent?.checked ? <Icon name="check" size={14} color={c.surface} /> : null}
            </View>
            <Text style={[type(13, 600), { color: c.soft, flex: 1 }]}>{consentLine}</Text>
          </Pressable>
        ) : null}
        {err ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 }}><Icon name="info" size={15} color={c.red} /><Text style={[type(13, 700), { color: c.red, flex: 1 }]}>{err}</Text></View> : null}
        {info ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 }}><Icon name="check" size={15} color={c.green} /><Text style={[type(13, 700), { color: c.green, flex: 1 }]}>{info}</Text></View> : null}
      </Animated.View>
      <View style={{ flex: 1, minHeight: 24 }} />
      <Btn
        label={busy ? (recovering ? 'Sending code…' : mode === 'signin' ? 'Signing in…' : 'Creating…') : (recovering ? 'Send recovery code' : mode === 'signin' ? 'Sign in' : 'Create account')}
        iconRight={busy ? undefined : 'arrow'} loading={busy} onPress={submit} block lg
      />
      {!recovering ? <Pressable onPress={emailCode} accessibilityRole="button" style={{ marginTop: 16, alignSelf: 'center' }}>
        <Text style={[type(13.5, 700), { color: c.soft }]}>{codeBusy ? 'Sending code…' : 'Email me a sign-in code instead'}</Text>
      </Pressable> : null}
    </>
  );
}

const stt = StyleSheet.create({
  input: { height: 56, borderRadius: radius.card, paddingHorizontal: 18, borderWidth: 1, fontSize: 16 },
});
