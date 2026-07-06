import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, MiniTag } from '../src/ui/layout';

interface Addr { id: string; label: string; title: string; sub: string; }

const ADDRESSES: Addr[] = [
  { id: 'home', label: 'Home', title: '88 Highland Ave NE, Apt 4', sub: 'Atlanta, GA 30312' },
  { id: 'work', label: 'Work', title: '1100 Peachtree St NE', sub: 'Atlanta, GA 30309' },
];

export default function Addresses() {
  const c = useC();
  const { toast } = useStore();
  const [selected, setSelected] = useState('home');

  return (
    <Screen>
      <TopBar title="Addresses" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {ADDRESSES.map((a) => {
          const on = a.id === selected;
          return (
            <Press key={a.id} scale={0.99} onPress={() => { setSelected(a.id); toast('Delivery address updated', 'pin', true); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, borderRadius: radius.card }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: on ? c.surface : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="pin" size={20} color={on ? c.primary : c.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={[type(14.5, 800), { color: c.ink }]}>{a.label}</Text>
                    <MiniTag label={a.label} tone={on ? 'green' : 'purple'} />
                  </View>
                  <Text style={[type(13, 500), { color: c.soft, marginTop: 3 }]}>{a.title}</Text>
                  <Text style={[type(12.5, 500), { color: c.muted, marginTop: 1 }]}>{a.sub}</Text>
                </View>
                <Press scale={0.9} onPress={() => toast('Edit address — demo')} hitSlop={8}>
                  <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="chevRight" size={18} color={c.muted} />
                  </View>
                </Press>
              </View>
            </Press>
          );
        })}

        <View style={{ height: 4 }} />
        <Btn label="Add a new address" icon="plus" variant="ghost" block onPress={() => toast('Add address — demo')} />
      </ScrollView>
    </Screen>
  );
}
