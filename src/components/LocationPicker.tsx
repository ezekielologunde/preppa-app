import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { useStore } from '../store/store';
import { Icon, Press } from '../ui';

const AREAS = ['Atlanta, GA', 'Midtown, Atlanta', 'Old Fourth Ward', 'Inman Park', 'Poncey-Highland', 'Decatur, GA', 'Buckhead, Atlanta'];

/** Bottom-sheet area picker bound to the global `location`. */
export function LocationPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useC();
  const insets = useSafeAreaInsets();
  const { location, setLocation, toast } = useStore();
  const pick = (a: string) => { setLocation(a); toast(`Location set to ${a}`, 'pin', true); onClose(); };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: 10, paddingBottom: insets.bottom + 16, paddingHorizontal: 16 }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: 'center', marginBottom: 12 }} />
          <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.4, marginBottom: 8, paddingHorizontal: 4 }]}>Choose your area</Text>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
