import React from 'react';
import { View, Text } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type, shadow } from '../theme/theme';
import { useStore } from '../store/store';
import { Icon, Press } from '../ui';

const MODES = [
  { id: 'delivery', t: 'Delivery', ico: 'truck' },
  { id: 'pickup', t: 'Pickup', ico: 'bag' },
] as const;

/** Shared Delivery/Pickup segmented control bound to the global `mode`.
 *  Lives on Home (browse bias) and in cart/checkout (authoritative, where it sets the fee). */
export function ModeToggle({ sm }: { sm?: boolean }) {
  const c = useC();
  const { mode, setMode } = useStore();
  const h = sm ? 34 : 36;
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: c.bg2, padding: 4, borderRadius: 13, gap: 4 }}>
      {MODES.map((m) => {
        const on = mode === m.id;
        return (
          <Press key={m.id} scale={0.97} onPress={() => setMode(m.id)} label={m.t}>
            <View style={[{ height: h, paddingHorizontal: sm ? 15 : 18, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }, on ? { backgroundColor: c.surface, ...shadow.soft } : null]}>
              <Icon name={m.ico} size={15} color={on ? c.ink : c.soft} />
              <Text style={[type(13.5, 700), { color: on ? c.ink : c.soft }]}>{m.t}</Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}
