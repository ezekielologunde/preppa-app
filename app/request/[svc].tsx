import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { svcById, ServiceRequest, Quote } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Stepper, Btn } from '../../src/ui';
import { Screen, TopBar, Dock, Block } from '../../src/ui/layout';
import { Burst } from '../../src/components/shared';
import { NotFound } from '../../src/components/NotFound';

export default function ServiceRequestFlow() {
  const c = useC();
  const router = useRouter();
  const { svc } = useLocalSearchParams<{ svc: string }>();
  const insets = useSafeAreaInsets();
  const { addRequest, address, addresses, selectAddress } = useStore();
  const s = svcById(svc!);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [size, setSize] = useState(svc === 'bulk' ? 20 : 2);
  const [budget, setBudget] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [addrOpen, setAddrOpen] = useState(false);
  const [done, setDone] = useState<ServiceRequest | null>(null);
  if (!s) return <NotFound title="Request" />;
  const DAYS = nextDays();
  const SLOTS = ['Morning', 'Afternoon', 'Evening'];
  const when = day && slot ? `${day} · ${slot}` : '';
  const valid = !!when && !!budget;

  const post = () => {
    const req: ServiceRequest = {
      id: 'REQ-' + (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-5).toUpperCase(),
      svc: s.id,
      title: s.sizeLbl ? `${s.name} · ${size} ${s.sizeLbl.toLowerCase()}` : s.name,
      when,
      loc: address ? `${address.label} · ${address.line1}` : 'Home',
      size: s.sizeLbl ? `${size} ${s.sizeLbl.toLowerCase()}` : null,
      budget: budget!,
      notes,
      status: 'open',
      quotes: [] as Quote[],
    };
    addRequest(req);
    setDone(req);
  };

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Request posted"
          body="Verified Preppas near you are being notified. Fixed-price quotes usually arrive within minutes — you pick who to book."
          actionLabel="View my request"
          onAction={() => router.replace(`/quotes/${done.id}`)}
          secondaryLabel="Done"
          onSecondary={() => router.back()}
        />
      </Screen>
    );
  }

  const kinput = { height: 50, backgroundColor: c.bg2, borderRadius: 13, paddingHorizontal: 15, color: c.ink, ...type(14.5, 600) };

  return (
    <Screen>
      <TopBar title={s.name} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Block title="When">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 7, paddingRight: 4 }}>
            {DAYS.map((d) => <DayChip key={d} label={d} on={day === d} onPress={() => setDay(d)} />)}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 7, marginTop: 10 }}>
            {SLOTS.map((sl) => <DayChip key={sl} label={sl} on={slot === sl} onPress={() => setSlot(sl)} />)}
          </View>
        </Block>

        {s.sizeLbl ? (
          <Block title={s.sizeLbl}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[type(14.5, 700), { color: c.soft }]}>How many?</Text>
              <Stepper value={size} onDec={() => setSize(Math.max(1, size - (svc === 'bulk' ? 5 : 1)))} onInc={() => setSize(size + (svc === 'bulk' ? 5 : 1))} />
            </View>
          </Block>
        ) : null}

        <Block title="Budget">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {s.budgets.map((b) => <DayChip key={b} label={b} on={budget === b} onPress={() => setBudget(b)} />)}
          </View>
        </Block>

        <Block title="Where">
          <Press scale={0.99} onPress={() => setAddrOpen(true)} label="Change address">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="pin" size={20} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type(14.5, 800), { color: c.ink }]}>{address ? `${address.label} · ${address.line1}` : 'Add an address'}</Text>
                {address ? <Text style={[type(13, 500), { color: c.soft, marginTop: 2 }]}>{address.line2}</Text> : null}
              </View>
              <Icon name="chevRight" size={16} color={c.muted} />
            </View>
          </Press>
        </Block>

        <Block title="Details">
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={s.notesPh}
            placeholderTextColor={c.muted}
            multiline
            style={{ ...kinput, height: undefined, minHeight: 96, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' }}
          />
        </Block>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginHorizontal: 16, marginTop: 14, padding: 14, borderRadius: radius.md, backgroundColor: c.primaryL }}>
          <Icon name="shield" size={20} color={c.primary} />
          <Text style={[type(12.5, 600), { color: c.ink2, flex: 1, lineHeight: 18 }]}>Quotes are <Text style={type(12.5, 800)}>fixed prices</Text> from verified Preppas — no haggling, no surprises. Payment is held by Preppa until the job is done.</Text>
        </View>
      </ScrollView>

      <Dock>
        <Btn label="Post request" flex={1} disabled={!valid} onPress={post} />
      </Dock>

      <Modal visible={addrOpen} transparent animationType="slide" onRequestClose={() => setAddrOpen(false)} statusBarTranslucent>
        <Pressable onPress={() => setAddrOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: 10, paddingBottom: insets.bottom + 16, paddingHorizontal: 16 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: 'center', marginBottom: 12 }} />
            <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.4, marginBottom: 8, paddingHorizontal: 4 }]}>Where should they cook?</Text>
            {addresses.map((a) => {
              const on = address?.id === a.id;
              return (
                <Press key={a.id} scale={0.99} onPress={() => { selectAddress(a.id); setAddrOpen(false); }} label={a.label}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: on ? c.primaryL : 'transparent' }}>
                    <Icon name="pin" size={18} color={on ? c.primary : c.soft} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type(15, on ? 800 : 700), { color: c.ink }]}>{a.label} · {a.line1}</Text>
                      <Text style={[type(12.5, 500), { color: c.soft, marginTop: 1 }]}>{a.line2}</Text>
                    </View>
                    {on ? <Icon name="check" size={18} color={c.primary} /> : null}
                  </View>
                </Press>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/** The next 7 days as friendly labels — "Today", "Tomorrow", then "Wed Jul 9". */
function nextDays(): string[] {
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    out.push(i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${wd[d.getDay()]} ${mo[d.getMonth()]} ${d.getDate()}`);
  }
  return out;
}

function DayChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.95} onPress={onPress}>
      <View style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type(13, 800), { color: on ? '#fff' : c.soft }]}>{label}</Text>
      </View>
    </Press>
  );
}
