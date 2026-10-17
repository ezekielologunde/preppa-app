import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../theme/ThemeContext';
import { type, serif, radius } from '../theme/theme';
import { Icon, Btn } from '../ui';
import { joinWaitlist } from '../lib/waitlist';

/**
 * Shown on Home only when the catalog loaded successfully and there is genuinely no supply
 * yet (no meals and no kitchens at all). It replaces a blank feed with the two real actions
 * that exist before cooks are live: get notified, or become one of the first cooks.
 * Never rendered on load errors — those keep their existing retry states.
 */
export function LaunchingSoon({ area }: { area: string }) {
  const c = useC();
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const submitted = React.useRef(false);

  const submit = async () => {
    // Enter and a tap can arrive before React renders busy. Keep success locked;
    // only failed attempts unlock the form for a retry.
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setErr(null);
    try {
      const r = await joinWaitlist(email);
      if (r.ok) setDone(true);
      else {
        submitted.current = false;
        setErr(r.reason === 'invalid_email' ? 'Enter a valid email address.' : 'Something went wrong. Please try again.');
      }
    } catch {
      submitted.current = false;
      setErr('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginHorizontal: 20, marginTop: 8, padding: 22, borderRadius: radius.card, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chefhat" size={22} color={c.primary} />
      </View>
      <Text accessibilityRole="header" style={[serif(26, 600), { color: c.ink, marginTop: 16, letterSpacing: -0.4, lineHeight: 31 }]}>
        Preppa is opening near {area}
      </Text>
      <Text style={[type(15, 400), { color: c.soft, marginTop: 8, lineHeight: 22 }]}>
        We’re onboarding our first home cooks now. Ordering opens as soon as the first kitchens are approved in your area.
      </Text>

      {done ? (
        <View accessibilityRole="alert" style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="check" size={18} color={c.primary} />
          <Text style={[type(15, 700), { color: c.ink, flex: 1 }]}>You’re on the list. We’ll email you when cooks go live.</Text>
        </View>
      ) : (
        <View style={{ marginTop: 18 }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Your email"
            placeholderTextColor={c.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            editable={!busy}
            accessibilityLabel="Email address for the launch waitlist"
            onSubmitEditing={submit}
            style={{ height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: err ? c.red : c.border2, paddingHorizontal: 16, fontSize: 16, color: c.ink, backgroundColor: c.bg }}
          />
          {err ? <Text accessibilityRole="alert" style={[type(13, 600), { color: c.red, marginTop: 8 }]}>{err}</Text> : null}
          <Btn label="Notify me at launch" icon="bell" block loading={busy} onPress={submit} style={{ marginTop: 12 }} />
        </View>
      )}

      <View style={{ height: 1, backgroundColor: c.border, marginVertical: 20 }} />
      <Text style={[type(15, 700), { color: c.ink }]}>Love to cook?</Text>
      <Text style={[type(14, 400), { color: c.soft, marginTop: 4, lineHeight: 20 }]}>
        Apply to be one of our first Preppers and sell your meals to neighbors.
      </Text>
      <Btn label="Apply to cook" variant="ghost" icon="chefhat" block onPress={() => router.push('/apply')} style={{ marginTop: 12 }} />
    </View>
  );
}
