import React from 'react';
import { View, Text } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { useStore } from '../store/store';
import { Icon, Press, Sheet } from '../ui';

const AREAS = ['Atlanta, GA', 'Midtown, Atlanta', 'Old Fourth Ward', 'Inman Park', 'Poncey-Highland', 'Decatur, GA', 'Buckhead, Atlanta'];

/** Bottom-sheet area picker bound to the global `location`. */
export function LocationPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useC();
  const { location, setLocation, toast } = useStore();
  const pick = (a: string) => { setLocation(a); toast(`Location set to ${a}`, 'pin', true); onClose(); };
  return (
    <Sheet visible={visible} onClose={onClose} title="Choose your area">
      {AREAS.map((a) => {
        const on = a === location;
        return (
          <Press key={a} scale={0.99} onPress={() => pick(a)} label={a}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: on ? c.primaryL : 'transparent' }}>
              <Icon name="pin" size={18} color={on ? c.primary : c.soft} />
              <Text style={[type(15, on ? 800 : 600), { color: c.ink, flex: 1 }]}>{a}</Text>
              {on ? <Icon name="check" size={18} color={c.primary} /> : null}
            </View>
          </Press>
        );
      })}
    </Sheet>
  );
}
