import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon } from '../../src/ui';
import { money } from '../../src/data/data';
import { BALANCE, LEDGER } from '../../src/data/cook';
import { HubHeader, BalanceStrip, StatTile, KBtn, KSec, well, Tone } from '../(tabs)/my-hub';

export default function MoneyScreen() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HubHeader eyebrow="My Hub" name="Earnings" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 4, paddingBottom: 40 }}>
        <BalanceStrip />
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 14 }}>
          <StatTile ic="trendUp" tone="ic-green" value={money(BALANCE.week)} label="This week" />
          <StatTile ic="bars" tone="ic-blue" value={money(BALANCE.month)} label="This month" />
        </View>

        <View style={{ marginHorizontal: 20, marginTop: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bank" size={22} color={c.ink} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.2 }]}>Chase •••• 4242</Text>
            <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>Default payout · 1–2 business days</Text>
          </View>
          <KBtn label="Manage" variant="ghost" sm onPress={() => toast('Manage payout methods', 'bank')} />
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <KBtn label={`Request payout · ${money(BALANCE.available)}`} variant="pri" block icon="bank" onPress={() => router.push('/hub/payout')} />
        </View>

        <KSec title="Recent activity" link="Statement" onLink={() => toast('Full statement — demo', 'info')} />
        <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, overflow: 'hidden' }}>
          {LEDGER.map((e, i) => {
            const [bg, fg] = well(c, e.cls as Tone);
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i === LEDGER.length - 1 ? 0 : 1, borderBottomColor: c.border2 }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={e.ic} size={17} color={fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type(13.5, 800), { color: c.ink }]}>{e.nm}</Text>
                  <Text style={[type(12, 600), { color: c.muted, marginTop: 1 }]}>{e.mt}</Text>
                </View>
                <Text style={[type(15, 900), { color: e.pos ? c.green : c.ink, letterSpacing: -0.3 }]}>{e.pos ? '+' : '−'}{money(Math.abs(e.amt))}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
