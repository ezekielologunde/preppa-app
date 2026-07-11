import React from 'react';
import { View, Text } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { Press } from '../ui';

/** Fixed segmented switcher for Discover's modes (Meals · Plans · Preppers · Services). */
export function ModeTabs<T extends string>({ modes, value, onChange }: {
  modes: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', gap: 6, backgroundColor: c.bg2, borderRadius: radius.pill, padding: 4 }}>
      {modes.map((m) => {
        const on = m.key === value;
        return (
          <Press key={m.key} scale={0.97} onPress={() => onChange(m.key)} style={{ flex: 1 }} label={m.label}>
            <View style={{ height: 38, borderRadius: radius.pill, backgroundColor: on ? c.surface : 'transparent', alignItems: 'center', justifyContent: 'center', ...(on ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : {}) }}>
              <Text style={[type(13.5, on ? 900 : 700), { color: on ? c.ink : c.soft }]}>{m.label}</Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}
