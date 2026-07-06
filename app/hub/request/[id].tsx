import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../../../src/theme/ThemeContext';
import { type } from '../../../src/theme/theme';
import { useStore } from '../../../src/store/store';
import { Icon } from '../../../src/ui';
import { Screen, TopBar, Dock } from '../../../src/ui/layout';
import { Burst } from '../../../src/components/shared';
import { CATER_INCOMING } from '../../../src/data/cook';
import { KBtn, well, Tone } from '../../(tabs)/my-hub';

function BreakRow({ ic, tone, label, value, last }: { ic: string; tone: Tone; label: string; value: string; last?: boolean }) {
  const c = useC();
  const [bg, fg] = well(c, tone);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={ic} size={15} color={fg} />
        </View>
        <Text style={[type(13.5, 700), { color: c.soft }]}>{label}</Text>
      </View>
      <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{value}</Text>
    </View>
  );
}

export default function CaterRequestDetail() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useStore();
  const r = CATER_INCOMING.find((x) => x.id === id) || CATER_INCOMING[0];
  const [done, setDone] = useState(false);
  const host0 = r.host.split('·')[0].trim();

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Request accepted"
          body={`You’re booked with ${host0} for ${r.date}. We’ve started a chat so you can finalize the details.`}
          actionLabel="Open chat"
          onAction={() => { router.back(); toast('Chat with ' + host0, 'chat'); }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Catering request" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 18, paddingBottom: 120 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={[type(10, 900), { color: c.purple, backgroundColor: c.purpleL, letterSpacing: 0.4, textTransform: 'uppercase', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7, overflow: 'hidden', alignSelf: 'flex-start' }]}>{r.type}</Text>
          <Text style={[type(23, 900), { color: c.ink, letterSpacing: -0.8, marginTop: 12 }]}>{r.title}</Text>
          <Text style={[type(14, 700), { color: c.soft, marginTop: 4 }]}>Requested by {r.host}</Text>
        </View>
        <View style={{ marginHorizontal: 20, marginTop: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, paddingHorizontal: 16 }}>
          <BreakRow ic="calendar" tone="ic-purple" label="Date" value={r.date} />
          <BreakRow ic="users" tone="ic-amber" label="Guests" value={String(r.guests ?? '—')} />
          <BreakRow ic="wallet" tone="ic-green" label="Budget" value={r.budget} />
          <BreakRow ic="pin2" tone="ic-blue" label="Location" value={r.loc} last />
        </View>
        <Text style={[type(17, 900), { color: c.ink, letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 }]}>Their message</Text>
        <Text style={[type(14.5, 500), { color: c.ink2, lineHeight: 22, marginHorizontal: 20, padding: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 16 }]}>{`“${r.msg}”`}</Text>
      </ScrollView>
      <Dock>
        <KBtn label="Decline" variant="ghost" flex={1} height={52} onPress={() => { router.back(); toast('Request declined', 'x'); }} />
        <KBtn label="Accept request" variant="pri" icon="check" flex={2} height={52} onPress={() => setDone(true)} />
      </Dock>
    </Screen>
  );
}
