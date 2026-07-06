import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press } from '../../src/ui';
import { money } from '../../src/data/data';
import { CATER_OPEN, CATER_INCOMING, MY_BIDS, CaterReq } from '../../src/data/cook';
import { HubHeader, KSeg, KBtn } from '../(tabs)/my-hub';

function Fact({ ic, label, budget }: { ic: string; label: string; budget?: boolean }) {
  const c = useC();
  const fg = budget ? '#0f7a39' : c.ink2;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 9, backgroundColor: budget ? c.greenL : c.bg2 }}>
      <Icon name={ic} size={14} color={budget ? '#0f7a39' : c.muted} />
      <Text style={[type(12.5, 700), { color: fg }]}>{label}</Text>
    </View>
  );
}

function Badge({ label }: { label: string }) {
  const c = useC();
  return <Text style={[type(10, 900), { color: c.purple, backgroundColor: c.purpleL, letterSpacing: 0.4, textTransform: 'uppercase', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7, overflow: 'hidden' }]}>{label}</Text>;
}

function ReqCard({ r, mode }: { r: CaterReq; mode: 'open' | 'incoming' }) {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16, marginHorizontal: 20, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Badge label={r.type} />
        <Text style={[type(11.5, 700), { color: c.muted, marginLeft: 'auto' }]}>{r.posted || r.date}</Text>
      </View>
      <Text style={[type(16.5, 900), { color: c.ink, letterSpacing: -0.4, marginTop: 11 }]}>{r.title}</Text>
      <Text style={[type(13, 700), { color: c.soft, marginTop: 3 }]}>{r.host}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
        <Fact ic="calendar" label={r.date} />
        {r.guests != null ? <Fact ic="users" label={`${r.guests} guests`} /> : null}
        <Fact ic="pin2" label={r.loc} />
        <Fact ic="wallet" label={r.budget} budget />
      </View>
      {mode === 'incoming' && r.msg ? (
        <Text style={[type(13.5, 500), { color: c.soft, lineHeight: 20, marginTop: 13, backgroundColor: c.bg2, borderRadius: 12, padding: 13 }]}>{`“${r.msg}”`}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15 }}>
        {mode === 'open' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 'auto' }}>
              <Icon name="users" size={14} color={c.muted} />
              <Text style={[type(12.5, 700), { color: c.muted }]}>{`${r.bids} quote${r.bids !== 1 ? 's' : ''} so far`}</Text>
            </View>
            <KBtn label="Send quote" variant="pri" icon="tag" onPress={() => router.push(`/hub/bid/${r.id}`)} />
          </>
        ) : (
          <>
            <KBtn label="Decline" variant="ghost" flex={1} height={44} onPress={() => toast('Declined request', 'x')} />
            <KBtn label="Review & accept" variant="pri" flex={1} height={44} onPress={() => router.push(`/hub/request/${r.id}`)} />
          </>
        )}
      </View>
    </View>
  );
}

export default function CateringScreen() {
  const c = useC();
  const router = useRouter();
  const [seg, setSeg] = useState('open');
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HubHeader
        eyebrow="My Hub"
        name="Requests & events"
        onBack={() => router.back()}
        below={<KSeg options={[{ key: 'open', label: 'Open' }, { key: 'incoming', label: `Requests · ${CATER_INCOMING.length}` }, { key: 'bids', label: 'My quotes' }]} value={seg} onChange={setSeg} />}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        {seg === 'open' ? (
          <>
            <Text style={[type(13, 600), { color: c.soft, paddingHorizontal: 20, paddingBottom: 8 }]}>Open requests near you — send one fixed quote. The customer picks.</Text>
            {CATER_OPEN.map((r) => <ReqCard key={r.id} r={r} mode="open" />)}
          </>
        ) : null}
        {seg === 'incoming' ? (
          <>
            <Text style={[type(13, 600), { color: c.soft, paddingHorizontal: 20, paddingBottom: 8 }]}>Customers who requested you directly.</Text>
            {CATER_INCOMING.map((r) => <ReqCard key={r.id} r={r} mode="incoming" />)}
          </>
        ) : null}
        {seg === 'bids' ? (
          <View style={{ paddingTop: 4 }}>
            {MY_BIDS.map((b) => {
              const meta = b.status === 'accepted' ? { label: 'Accepted', bg: c.greenL, fg: '#0f7a39', ic: 'check' } : b.status === 'declined' ? { label: 'Not selected', bg: c.bg2, fg: c.muted, ic: 'x' } : { label: 'Awaiting decision', bg: c.bg2, fg: c.soft, ic: 'clock' };
              return (
                <View key={b.id} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16, marginHorizontal: 20, marginBottom: 12 }}>
                  <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{b.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 11, paddingHorizontal: 13, borderRadius: 12, backgroundColor: meta.bg }}>
                    <Icon name={meta.ic} size={15} color={meta.fg} />
                    <Text style={[type(13, 700), { color: meta.fg }]}>{meta.label}</Text>
                    <Text style={[type(13, 900), { color: meta.fg, marginLeft: 'auto' }]}>{money(b.amount)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
