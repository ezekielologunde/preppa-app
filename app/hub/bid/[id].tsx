import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../../../src/theme/ThemeContext';
import { type } from '../../../src/theme/theme';
import { useStore } from '../../../src/store/store';
import { Icon } from '../../../src/ui';
import { Screen, TopBar, Dock, DockTotal } from '../../../src/ui/layout';
import { Burst } from '../../../src/components/shared';
import { money } from '../../../src/data/data';
import { caterById, CATER_OPEN } from '../../../src/data/cook';
import { KField, KInput, MoneyInput, KBtn } from '../../(tabs)/my-hub';

function Fact({ ic, label, budget }: { ic: string; label: string; budget?: boolean }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 9, backgroundColor: budget ? c.greenL : c.bg2 }}>
      <Icon name={ic} size={14} color={budget ? '#0f7a39' : c.muted} />
      <Text style={[type(12.5, 700), { color: budget ? '#0f7a39' : c.ink2 }]}>{label}</Text>
    </View>
  );
}

export default function BidFlow() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useStore();
  const r = caterById(id!) || CATER_OPEN[0];
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const valid = !!amount;
  const host0 = r.host.split('·')[0].split(' ')[0];

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst title="Quote sent" body={`Your fixed ${money(Number(amount) || 0)} quote for “${r.title}” is in. It’s final — no back-and-forth. You’ll be notified if ${host0} books you.`} actionLabel="Back to requests" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <TopBar title="Send a quote" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ marginTop: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16 }}>
          <Text style={[type(10, 900), { color: c.purple, backgroundColor: c.purpleL, letterSpacing: 0.4, textTransform: 'uppercase', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7, overflow: 'hidden', alignSelf: 'flex-start' }]}>{r.type}</Text>
          <Text style={[type(17, 900), { color: c.ink, letterSpacing: -0.5, marginTop: 10 }]}>{r.title}</Text>
          <Text style={[type(13, 700), { color: c.soft, marginTop: 3 }]}>{r.host}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
            <Fact ic="calendar" label={r.date} />
            {r.guests != null ? <Fact ic="users" label={`${r.guests} guests`} /> : null}
            <Fact ic="wallet" label={r.budget} budget />
          </View>
        </View>
        <KField label="Your fixed quote" hint={`budget ${r.budget}`}>
          <MoneyInput value={amount} onChange={setAmount} big />
        </KField>
        <KField label="Pitch" hint="why you?">
          <KInput value={msg} onChange={setMsg} placeholder="Hi! I’d love to cook for your event. Here’s what I’m thinking for the menu…" multiline />
        </KField>
        <KField label="Proposed menu" hint="optional">
          <KBtn label="Attach a sample menu" variant="ghost" block icon="utensils" height={50} onPress={() => toast('Attach menu — demo', 'utensils')} />
        </KField>
      </ScrollView>
      <Dock>
        <DockTotal label="Your quote" value={money(Number(amount) || 0)} />
        <KBtn label="Send quote" variant="pri" flex={1} height={48} onPress={() => valid && setDone(true)} style={{ opacity: valid ? 1 : 0.5 }} />
      </Dock>
    </Screen>
  );
}
