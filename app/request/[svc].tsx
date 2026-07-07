import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
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
  const { addRequest, toast } = useStore();
  const s = svcById(svc!);
  const [when, setWhen] = useState('');
  const [size, setSize] = useState(svc === 'bulk' ? 20 : 2);
  const [budget, setBudget] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [joined, setJoined] = useState(false);
  const [done, setDone] = useState<ServiceRequest | null>(null);
  if (!s) return <NotFound title="Request" />;
  const valid = !!when.trim() && !!budget;

  const post = () => {
    const req: ServiceRequest = {
      id: 'REQ-' + (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-5).toUpperCase(),
      svc: s.id,
      title: s.sizeLbl ? `${s.name} · ${size} ${s.sizeLbl.toLowerCase()}` : s.name,
      when,
      loc: 'Home · 88 Highland Ave NE',
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

  // Premium services (in-home chef, catering) gate on real verification + protected
  // payment, which don't exist yet — so they run as an early-access waitlist, not a
  // live escrow booking. Demand is never gated; supply/launch is.
  if (s.premium) {
    return (
      <Screen bg={c.surface}>
        <TopBar title={s.name} onBack={() => router.back()} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          <View style={{ alignItems: 'center', marginTop: 26 }}>
            <View style={{ width: 66, height: 66, borderRadius: 21, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={s.ico} size={30} color={c.primary} />
            </View>
            <View style={{ height: 24, marginTop: 14, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type(10.5, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }]}>Premium · early access</Text>
            </View>
            <Text style={[type(22, 900), { color: c.ink, letterSpacing: -0.6, marginTop: 16, textAlign: 'center' }]}>{s.name}</Text>
            <Text style={[type(14, 600), { color: c.soft, marginTop: 8, textAlign: 'center', lineHeight: 21 }]}>{s.sub}. This one runs on real trust, so we’re opening it with background-checked, verified cooks and protected payments first. Join the list and we’ll reach out when it’s live in your area.</Text>
          </View>
          <View style={{ marginTop: 24, gap: 12 }}>
            <WLRow icon="shield" text="Background-checked, verified cooks only" />
            <WLRow icon="card" text="Payment protected end-to-end" />
            <WLRow icon="star" text="Fixed quotes — no haggling, no surprises" />
          </View>
        </ScrollView>
        <Dock>
          <Btn label={joined ? 'You’re on the list ✓' : 'Request early access'} flex={1} disabled={joined} onPress={() => { setJoined(true); toast('You’re on the early-access list — we’ll be in touch', 'check', true); }} />
        </Dock>
      </Screen>
    );
  }

  const kinput = { height: 50, backgroundColor: c.bg2, borderRadius: 13, paddingHorizontal: 15, color: c.ink, ...type(14.5, 600) };

  return (
    <Screen>
      <TopBar title={s.name} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Block title="When">
          <TextInput
            value={when}
            onChangeText={setWhen}
            placeholder={svc === 'grocery' || svc === 'errand' ? 'e.g. Today, before 5 PM' : 'e.g. Sat, Jul 12 · 7:00 PM'}
            placeholderTextColor={c.muted}
            style={kinput}
          />
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="pin" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type(14.5, 800), { color: c.ink }]}>Home · 88 Highland Ave NE</Text>
              <Text style={[type(13, 500), { color: c.soft, marginTop: 2 }]}>Apt 4 · Atlanta, GA 30312</Text>
            </View>
            <Press scale={0.9} onPress={() => toast('Edit address — demo')}>
              <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chevRight" size={16} color={c.muted} />
              </View>
            </Press>
          </View>
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
          <Text style={[type(12.5, 600), { color: c.ink2, flex: 1, lineHeight: 18 }]}>Quotes are <Text style={type(12.5, 800)}>fixed prices</Text> from verified Preppas — no haggling, no surprises. You arrange payment with your Preppa once you pick.</Text>
        </View>
      </ScrollView>

      <Dock>
        <Btn label="Post request" flex={1} disabled={!valid} onPress={post} />
      </Dock>
    </Screen>
  );
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

function WLRow({ icon, text }: { icon: string; text: string }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: c.bg2 }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={c.primary} />
      </View>
      <Text style={[type(14, 700), { color: c.ink, flex: 1 }]}>{text}</Text>
    </View>
  );
}
