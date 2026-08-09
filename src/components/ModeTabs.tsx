import React from 'react';
import { View, Text } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type, shadow } from '../theme/theme';
import { Press } from '../ui';

/** Fixed segmented switcher for Discover's modes (Meals · Plans · Preppers · Services).
 *  Flat rounded-rect treatment (matches Home's fulfillment-mode toggle), not a pill —
 *  pills are reserved for secondary filter chips, not primary navigation controls. */
export function ModeTabs<T extends string>({ modes, value, onChange }: {
  modes: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', gap: 4, backgroundColor: c.bg2, borderRadius: 13, padding: 4 }}>
      {modes.map((m) => {
        const on = m.key === value;
        return (
          <Press key={m.key} scale={0.97} onPress={() => onChange(m.key)} style={{ flex: 1 }} label={m.label} selected={on}>
            <View style={{ height: 38, borderRadius: 10, backgroundColor: on ? c.surface : 'transparent', borderWidth: 1, borderColor: on ? c.border : 'transparent', alignItems: 'center', justifyContent: 'center', ...(on ? shadow.soft : {}) }}>
              <Text style={[type(13.5, on ? 600 : 500), { color: on ? c.ink : c.soft }]}>{m.label}</Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}
