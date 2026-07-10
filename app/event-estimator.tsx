import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { Icon, Press, Stepper, Btn } from '../src/ui';
import { Screen, TopBar, Dock, Block } from '../src/ui/layout';
import {
  EVENT_TYPES, SERVICE_LEVELS, DIETARY_OPTIONS, estimate, usd, usdRange,
  type ServiceLevel, type EstimateResult,
} from '../src/lib/eventEstimator';

/**
 * Event cost estimator — the honest, supply-independent first slice of the Prep
 * Experiences direction. Advisory only: it ballparks budget/menu/quantities/staffing
 * so a customer can plan before talking to preppers. No bidding, no payment, no
 * promise the backend can't keep (real prices come from real quotes later).
 */
export default function EventEstimator() {
  const c = useC();
  const router = useRouter();
  const [eventType, setEventType] = useState<string>('corporate');
  const [adults, setAdults] = useState(20);
  const [children, setChildren] = useState(0);
  const [level, setLevel] = useState<ServiceLevel>('standard');
  const [dietary, setDietary] = useState<string[]>([]);
  const [result, setResult] = useState<EstimateResult | null>(null);

  const toggleDiet = (d: string) => setDietary((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  if (result) {
    return (
      <Screen bg={c.surface}>
        <TopBar title="Your estimate" onBack={() => setResult(null)} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          {/* Budget hero */}
          <View style={{ marginHorizontal: 16, marginTop: 16, padding: 20, borderRadius: radius.card, backgroundColor: c.primaryL }}>
            <Text style={[type(11.5, 900), { color: c.primary, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Estimated budget</Text>
            <Text style={[type(32, 900), { color: c.ink, letterSpacing: -1, marginTop: 6 }]}>{usdRange(result.budgetLow, result.budgetHigh)}</Text>
            <Text style={[type(13, 600), { color: c.soft, marginTop: 4 }]}>
              {usd(result.perPersonLow)}–{usd(result.perPersonHigh)} per person · {result.guests} guest{result.guests !== 1 ? 's' : ''}
            </Text>
          </View>

          {result.staffing ? (
            <Block title="Suggested staffing">
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <StatBox icon="chefhat" value={`${result.staffing.cooks}`} label={`cook${result.staffing.cooks !== 1 ? 's' : ''}`} />
                {result.staffing.servers > 0 ? <StatBox icon="users" value={`${result.staffing.servers}`} label={`server${result.staffing.servers !== 1 ? 's' : ''}`} /> : null}
              </View>
            </Block>
          ) : null}

          <Block title={result.model === 'class' ? 'The class' : result.model === 'mealprep' ? 'The plan' : 'Serving quantities'}>
            <View style={{ gap: 10 }}>
              {result.quantities.map((q) => (
                <View key={q.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[type(14, 600), { color: c.soft }]}>{q.label}</Text>
                  <Text style={[type(14.5, 800), { color: c.ink }]}>{q.value}</Text>
                </View>
              ))}
            </View>
          </Block>

          <Block title="Sample menu">
            <View style={{ gap: 9 }}>
              {result.menu.map((m) => (
                <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary }} />
                  <Text style={[type(14, 600), { color: c.ink2, flex: 1 }]}>{m}</Text>
                </View>
              ))}
            </View>
            <Text style={[type(12, 600), { color: c.muted, marginTop: 12, lineHeight: 17 }]}>A starting point — your prepper tailors the menu to your taste and guests.</Text>
          </Block>

          {/* Honest caveats */}
          <View style={{ marginHorizontal: 16, marginTop: 14, padding: 14, borderRadius: radius.md, backgroundColor: c.bg2, gap: 8 }}>
            {result.notes.map((n) => (
              <View key={n} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                <Icon name="info" size={15} color={c.muted} />
                <Text style={[type(12.5, 600), { color: c.soft, flex: 1, lineHeight: 18 }]}>{n}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <Dock column>
          <Btn label="Adjust details" variant="ghost" block onPress={() => setResult(null)} />
        </Dock>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Event cost estimator" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ marginHorizontal: 16, marginTop: 14 }}>
          <Text style={[type(14.5, 600), { color: c.soft, lineHeight: 21 }]}>
            Tell us about your event and we’ll ballpark the budget, menu and staffing — so you can plan before you talk to a prepper.
          </Text>
        </View>

        <Block title="Event type">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EVENT_TYPES.map((e) => (
              <Chip key={e.key} label={e.label} icon={e.icon} on={eventType === e.key} onPress={() => setEventType(e.key)} />
            ))}
          </View>
        </Block>

        <Block title="Guests">
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[type(14.5, 700), { color: c.soft }]}>Adults</Text>
              <Stepper value={adults} onDec={() => setAdults(Math.max(1, adults - 1))} onInc={() => setAdults(adults + 1)} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[type(14.5, 700), { color: c.soft }]}>Children</Text>
              <Stepper value={children} onDec={() => setChildren(Math.max(0, children - 1))} onInc={() => setChildren(children + 1)} />
            </View>
          </View>
        </Block>

        <Block title="Service level">
          <View style={{ gap: 9 }}>
            {SERVICE_LEVELS.map((s) => {
              const on = level === s.key;
              return (
                <Press key={s.key} scale={0.99} onPress={() => setLevel(s.key)} selected={on}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? c.primary : c.border2, backgroundColor: on ? c.primaryL : c.surface }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Icon name="check" size={13} color="#fff" /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[type(14.5, 800), { color: c.ink }]}>{s.label}</Text>
                      <Text style={[type(12.5, 500), { color: c.soft, marginTop: 1 }]}>{s.sub}</Text>
                    </View>
                  </View>
                </Press>
              );
            })}
          </View>
        </Block>

        <Block title="Dietary (optional)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DIETARY_OPTIONS.map((d) => (
              <Chip key={d} label={d} on={dietary.includes(d)} onPress={() => toggleDiet(d)} />
            ))}
          </View>
        </Block>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginHorizontal: 16, marginTop: 14, padding: 14, borderRadius: radius.md, backgroundColor: c.bg2 }}>
          <Icon name="info" size={18} color={c.muted} />
          <Text style={[type(12.5, 600), { color: c.soft, flex: 1, lineHeight: 18 }]}>These are planning estimates to set expectations — real, fixed prices come from prepper quotes.</Text>
        </View>
      </ScrollView>

      <Dock>
        <Btn label="Estimate cost" icon="wallet" flex={1} onPress={() => setResult(estimate({ eventType, adults, children, serviceLevel: level, dietary }))} />
      </Dock>
    </Screen>
  );
}

function Chip({ label, icon, on, onPress }: { label: string; icon?: string; on: boolean; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.95} onPress={onPress} selected={on}>
      <View style={{ height: 38, paddingHorizontal: 13, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? c.primary : c.bg2 }}>
        {icon ? <Icon name={icon} size={14} color={on ? '#fff' : c.soft} /> : null}
        <Text style={[type(13, 800), { color: on ? '#fff' : c.soft }]}>{label}</Text>
      </View>
    </Press>
  );
}

function StatBox({ icon, value, label }: { icon: string; value: string; label: string }) {
  const c = useC();
  return (
    <View style={{ flex: 1, padding: 14, borderRadius: radius.md, backgroundColor: c.bg2, alignItems: 'center', ...shadow.soft }}>
      <Icon name={icon} size={20} color={c.primary} />
      <Text style={[type(20, 900), { color: c.ink, marginTop: 6 }]}>{value}</Text>
      <Text style={[type(12, 700), { color: c.muted, marginTop: 1 }]}>{label}</Text>
    </View>
  );
}
