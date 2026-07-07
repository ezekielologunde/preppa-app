import React from 'react';
import { View, Text } from 'react-native';
import { COOKS, CookId } from '../data/data';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { Icon } from '../ui';

/**
 * In-home credential display. IMPORTANT: these are credentials the prepper has
 * *submitted*, not checks Preppa has independently run — the footer says so, and
 * nothing here should read as a platform-vouched safety guarantee. Real
 * verification is REQUIRES-SERVER. Do not reuse this on the delivery path.
 */
export function InHomeTrust({ cook, compact }: { cook: CookId; compact?: boolean }) {
  const c = useC();
  const info = COOKS[cook].inhome;
  const name = COOKS[cook].name;
  const items = [
    { ok: info.idVerified, label: 'ID on file' },
    { ok: info.backgroundCheck, label: 'Background check' },
    { ok: !!info.foodSafety, label: info.foodSafety ? `${info.foodSafety}` : 'Food-safety cert' },
    { ok: info.insured, label: 'Insured' },
  ];

  if (compact) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {items.filter((i) => i.ok).map((i) => (
          <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: c.primaryL }}>
            <Icon name="shield" size={11} color={c.primary} />
            <Text style={[type(11, 800), { color: c.primary }]}>{i.label}</Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: radius.card, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name="shield" size={18} color={c.primary} />
        <Text style={[type(15.5, 900), { color: c.ink, letterSpacing: -0.2 }]}>For cooking in your home</Text>
      </View>
      <View style={{ gap: 10 }}>
        {items.map((i) => (
          <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i.ok ? c.green : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={i.ok ? 'check' : 'clock'} size={13} color={i.ok ? '#fff' : c.muted} />
            </View>
            <Text style={[type(14, 700), { color: i.ok ? c.ink : c.muted, flex: 1 }]}>{i.label}</Text>
            <Text style={[type(12, 700), { color: i.ok ? c.soft : c.muted }]}>{i.ok ? 'Provided' : 'Pending'}</Text>
          </View>
        ))}
      </View>
      <Text style={[type(11.5, 500), { color: c.muted, lineHeight: 16, marginTop: 12 }]}>
        Credentials submitted by {name}. Preppa is rolling out independent background checks & food-safety verification — coming soon.
      </Text>
    </View>
  );
}
