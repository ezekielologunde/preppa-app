import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius as rad } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press } from '../../src/ui';
import { HubHeader } from '../(tabs)/my-hub';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS = ['Morning', 'Afternoon', 'Evening'];
const RADII = [2, 5, 10, 15, 25];

export default function AvailabilityScreen() {
  const c = useC();
  const router = useRouter();
  const { availSlots, toggleSlot, radius, setRadius } = useStore();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HubHeader eyebrow="My Hub" name="In-home availability" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 4, paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Text style={[type(14, 600), { color: c.soft, lineHeight: 21 }]}>Set when you can cook in a customer’s kitchen and how far you’ll travel. This is what people see when they book “Cook at My Place.”</Text>
        </View>

        <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 20, marginTop: 22, marginBottom: 10 }]}>Weekly availability · {availSlots.length} slots</Text>
        <View style={{ marginHorizontal: 16, borderRadius: rad.card, borderWidth: 1, borderColor: c.border2, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 6 }}>
          {DAYS.map((d, i) => (
            <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border2 }}>
              <Text style={[type(13.5, 800), { color: c.ink, width: 40 }]}>{d}</Text>
              <View style={{ flex: 1, flexDirection: 'row', gap: 7 }}>
                {SLOTS.map((sl) => {
                  const k = `${d}-${sl}`;
                  const on = availSlots.includes(k);
                  return (
                    <Press key={sl} scale={0.96} onPress={() => toggleSlot(k)} label={`${d} ${sl}`} style={{ flex: 1 }}>
                      <View style={{ height: 38, borderRadius: rad.md, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border }}>
                        <Text style={[type(12, 800), { color: on ? '#fff' : c.soft }]}>{sl}</Text>
                      </View>
                    </Press>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 20, marginTop: 24, marginBottom: 10 }]}>Service radius</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
          {RADII.map((r) => {
            const on = radius === r;
            return (
              <Press key={r} scale={0.95} onPress={() => setRadius(r)} label={`${r} miles`}>
                <View style={{ height: 40, paddingHorizontal: 18, borderRadius: rad.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border }}>
                  <Icon name="pin" size={14} color={on ? '#fff' : c.soft} />
                  <Text style={[type(13.5, 800), { color: on ? '#fff' : c.soft }]}>{r} mi</Text>
                </View>
              </Press>
            );
          })}
        </View>
        <Text style={[type(12.5, 500), { color: c.muted, paddingHorizontal: 20, marginTop: 12, lineHeight: 18 }]}>You’ll only get in-home requests within {radius} miles of your kitchen.</Text>
      </ScrollView>
    </View>
  );
}
