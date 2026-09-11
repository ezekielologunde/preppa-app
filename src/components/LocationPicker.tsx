import React, { useState } from 'react';
import { View, Text, ActivityIndicator, TextInput } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { useStore } from '../store/store';
import { captureCurrentLocation, geocodeAddressDetailed } from '../lib/geo';
import { Icon, Press, Sheet } from '../ui';

/** Bottom-sheet area picker bound to the global `location`. Offers real GPS capture
 *  ("Use my current location") plus free-text search (geocoded via Nominatim) — no
 *  hardcoded city/neighborhood list, since Preppa is not scoped to one city. */
export function LocationPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useC();
  const { location, setLocation, setCoords, setCountry, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const pick = async (a: string) => {
    const q = a.trim();
    if (!q) return;
    setBusy(true);
    try {
      const hit = await geocodeAddressDetailed(q);
      setLocation(q);
      setCoords(hit ? { lat: hit.lat, lng: hit.lng } : null);
      if (hit?.countryCode) setCountry(hit.countryCode);
      toast(hit ? `Location set to ${q}` : `Location set to ${q} (distance unavailable)`, 'pin', true);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const useCurrent = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const loc = await captureCurrentLocation();
      setLocation(loc.label);
      setCoords({ lat: loc.lat, lng: loc.lng });
      if (loc.countryCode) setCountry(loc.countryCode);
      toast(`Location set to ${loc.label}`, 'pin', true);
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
          <Text style={[type(15, 800), { color: c.accentText, flex: 1 }]}>{busy ? 'Getting your location…' : 'Use my current location'}</Text>
        </View>
      </Press>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 }}>
        <Icon name="pin" size={16} color={c.soft} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search for a city or area…"
          placeholderTextColor={c.soft}
          style={[type(15, 600), { color: c.ink, flex: 1, paddingVertical: 10 }]}
          onSubmitEditing={() => pick(query)}
          returnKeyType="search"
          editable={!busy}
        />
      </View>
      <Press scale={0.99} onPress={() => pick(query)} label="Set location" disabled={busy || query.trim().length < 3}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 12, marginTop: 4, borderRadius: radius.md, backgroundColor: query.trim().length >= 3 ? c.primaryL : 'transparent', opacity: query.trim().length >= 3 ? 1 : 0.4 }}>
          {busy ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="check" size={18} color={c.primary} />}
          <Text style={[type(15, 800), { color: c.accentText }]}>Set location</Text>
        </View>
      </Press>
      {location ? (
        <Text style={[type(12.5, 600), { color: c.soft, paddingHorizontal: 12, marginTop: 10 }]}>Current: {location}</Text>
      ) : null}
    </Sheet>
  );
}
