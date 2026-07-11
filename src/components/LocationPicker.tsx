import React, { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { useStore } from '../store/store';
import { captureCurrentLocation } from '../lib/geo';
import { Icon, Press, Sheet } from '../ui';

const AREAS = ['Atlanta, GA', 'Midtown, Atlanta', 'Old Fourth Ward', 'Inman Park', 'Poncey-Highland', 'Decatur, GA', 'Buckhead, Atlanta'];

/** Bottom-sheet area picker bound to the global `location`. Offers real GPS capture
 *  ("Use my current location") with the manual area list as a fallback. */
export function LocationPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useC();
  const { location, setLocation, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const pick = (a: string) => { setLocation(a); toast(`Location set to ${a}`, 'pin', true); onClose(); };
  const useCurrent = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const place = await captureCurrentLocation();
      setLocation(place);
      toast(`Location set to ${place}`, 'pin', true);
      onClose();
    } catch (e: any) {
      toast(e?.message || 'Couldn’t get your location — pick an area below.', 'info');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Choose your area">
      <Press scale={0.99} onPress={useCurrent} label="Use my current location">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, marginBottom: 6, borderRadius: radius.md, backgroundColor: c.primaryL }}>
          {busy ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="pin" size={18} color={c.primary} />}
          <Text style={[type(15, 800), { color: c.primary, flex: 1 }]}>{busy ? 'Getting your location…' : 'Use my current location'}</Text>
        </View>
      </Press>
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
