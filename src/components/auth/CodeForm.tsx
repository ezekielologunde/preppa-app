import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { sendEmailOtp, verifyEmailOtp, sendPasswordResetOtp, updatePassword, AUTH_TIMEOUT_MESSAGE } from '../../lib/supabase';
import { Icon } from '../../ui/Icon';
import { useC } from '../../theme/ThemeContext';
import { type, radius, FILL } from '../../theme/theme';
import { Spinner, Title, Lead, useShake } from './authUi';

// Optional props default to the native behaviour: a 24 second resend cooldown and today's copy.
export function Code({ email, onNext, newPassword, resendCooldownSec = 24, mapError }: {
  email: string;
  onNext: () => void;
  newPassword?: string;
  resendCooldownSec?: number;
  mapError?: (err: unknown) => string;
}) {
  const c = useC();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cool, setCool] = useState(0);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const ref = useRef<TextInput>(null);
  const shake = useShake();
  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 300); return () => clearTimeout(t); }, []);
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool((v) => v - 1), 1000); return () => clearTimeout(t); }, [cool]);
  useEffect(() => {
    // NB: depend on `code` only. If `busy` were a dep, flipping it in setBusy(true)
    // would re-run this effect and cancel the in-flight verify before it resolves.
    if (code.length !== 6 || busy) return;
    setBusy(true);
    let cancelled = false;
    verifyEmailOtp(email, code)
      .then(async () => { if (newPassword) await updatePassword(newPassword); })
      .then(() => { if (!cancelled) onNext(); })
      .catch((e: any) => {
        if (cancelled) return;
        setBusy(false);
        // A stalled network surfaces the timeout message; anything else is a bad code.
        setErr(mapError ? mapError(e) : e?.message === AUTH_TIMEOUT_MESSAGE ? e.message : 'That code didn’t match. Check the digits and try again.');
        shake.fire();
        setCode('');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const resend = async () => {
    if (resending || cool > 0) return;
    setResending(true);
    setErr(null);
    try {
      await (newPassword ? sendPasswordResetOtp(email) : sendEmailOtp(email));
      setCool(resendCooldownSec);
      setResent(true);
      setTimeout(() => setResent(false), 2400);
    } catch (e: any) {
      setErr(mapError ? mapError(e) : e?.message === AUTH_TIMEOUT_MESSAGE ? e.message : 'Couldn’t resend the code. Check your connection and try again.');
    } finally {
      setResending(false);
    }
  };
  return (
    <>
      <Title parts={['Check your inbox.']} />
      <Lead>We sent a 6-digit code to <Text style={{ color: c.ink, fontFamily: type(15.5, 700).fontFamily }}>{email}</Text>.</Lead>
      <Animated.View style={{ flexDirection: 'row', gap: 9, marginTop: 22, transform: [{ translateX: shake.x }] }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const live = i === code.length && !busy;
          return (
            <View key={i} style={[stt.otpBox, { backgroundColor: c.surface, borderColor: err ? c.red : live ? c.primary : c.border }]}>
              <Text style={[type(23, 900), { color: c.ink }]}>{code[i] || ''}</Text>
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
          accessibilityLabel="Six digit verification code"
          caretHidden
          selectionColor="transparent"
          style={[FILL, { color: 'transparent', fontSize: 24, textAlign: 'center' }] as any}
        />
      </Animated.View>
      {err ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}><Icon name="info" size={15} color={c.red} /><Text style={[type(13, 700), { color: c.red }]}>{err}</Text></View> : null}
      {busy ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}><Spinner size={15} color={c.primaryD} track={c.border} /><Text style={[type(13, 700), { color: c.soft }]}>Verifying…</Text></View> : null}
      <View style={{ flex: 1, minHeight: 24 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 4 }}>
        <Text style={[type(14, 600), { color: c.muted }]}>{resent ? 'Code re-sent ✓' : resending ? 'Sending another code…' : 'Didn’t get it?'}</Text>
      {!resent && !resending ? <Pressable disabled={cool > 0} onPress={resend} accessibilityRole="button" accessibilityState={{ disabled: cool > 0 }}><Text style={[type(14, 800), { color: cool > 0 ? c.muted : c.primary, textDecorationLine: cool > 0 ? 'none' : 'underline' }]}>{cool > 0 ? `Resend in ${cool}s` : 'Resend code'}</Text></Pressable> : null}
      </View>
    </>
  );
}

const stt = StyleSheet.create({
  otpBox: { flex: 1, height: 60, borderRadius: radius.card, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
