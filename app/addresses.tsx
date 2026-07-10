import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, MiniTag, Empty } from '../src/ui/layout';

export default function Addresses() {
  const c = useC();
  const router = useRouter();
  const { select } = useLocalSearchParams<{ select?: string }>();
  const selecting = select === '1';
  const { addresses, addressId, selectAddress, removeAddress, addAddress, updateAddress, toast } = useStore();

  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');

  const reset = () => { setAdding(false); setEditId(null); setLabel(''); setLine1(''); setLine2(''); };
  const openNew = () => { setEditId(null); setLabel(''); setLine1(''); setLine2(''); setAdding(true); };
  const openEdit = (a: { id: string; label: string; line1: string; line2: string }) => {
    setEditId(a.id); setLabel(a.label); setLine1(a.line1); setLine2(a.line2); setAdding(true);
  };

  const pick = (id: string) => {
    selectAddress(id);
    if (selecting) {
      toast('Delivery address updated', 'pin', true);
      router.back();
    }
  };

  const save = () => {
    if (!label.trim() || !line1.trim()) {
      toast('Add a label and street address', 'info');
      return;
    }
    const patch = { label: label.trim(), line1: line1.trim(), line2: line2.trim() };
    if (editId) {
      updateAddress(editId, patch);
      toast('Address updated', 'pin', true);
    } else {
      const id = addAddress(patch); // dedups: returns an existing id if identical
      const wasDuplicate = addresses.some((a) => a.id === id);
      toast(wasDuplicate ? 'That address is already saved — selected it' : 'Address added', 'pin', true);
    }
    reset();
  };

  return (
    <Screen>
      <TopBar title="Addresses" sub={selecting ? 'Pick one' : undefined} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {addresses.length === 0 && !adding ? (
          <Empty icon="pin" title="No addresses yet" body="Add a delivery address to check out." />
        ) : null}

        {addresses.map((a) => {
          const on = a.id === addressId;
          return (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 14, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, borderRadius: radius.card }}>
              <Press scale={0.99} onPress={() => pick(a.id)} label={`Use ${a.label} address`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: on ? c.surface : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="pin" size={20} color={on ? c.primary : c.ink} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={[type(14.5, 800), { color: c.ink }]}>{a.label}</Text>
                    {on ? <MiniTag label="Selected" tone="green" /> : null}
                  </View>
                  <Text numberOfLines={1} style={[type(13, 500), { color: c.soft, marginTop: 3 }]}>{a.line1}</Text>
                  {a.line2 ? <Text numberOfLines={1} style={[type(12.5, 500), { color: c.muted, marginTop: 1 }]}>{a.line2}</Text> : null}
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} /> : null}
                </View>
              </Press>
              <Press scale={0.9} onPress={() => openEdit(a)} label={`Edit ${a.label} address`} hitSlop={8}>
                <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="edit" size={15} color={c.muted} />
                </View>
              </Press>
              <Press scale={0.9} onPress={() => { removeAddress(a.id); toast('Address removed', 'x'); }} label={`Remove ${a.label} address`} hitSlop={8}>
                <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="x" size={16} color={c.muted} />
                </View>
              </Press>
            </View>
          );
        })}

        <View style={{ height: 4 }} />
        {adding ? (
          <View style={{ padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, backgroundColor: c.surface, gap: 10 }}>
            <Text style={[type(14, 900), { color: c.ink }]}>{editId ? 'Edit address' : 'New address'}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['Home', 'Work', 'Other'].map((l) => {
                const on = label.trim().toLowerCase() === l.toLowerCase();
                return (
                  <Press key={l} scale={0.96} onPress={() => setLabel(l)} label={`Label ${l}`} style={{ flex: 1 }}>
                    <View style={{ height: 38, borderRadius: radius.sm, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={[type(13, 800), { color: on ? c.primaryD : c.soft }]}>{l}</Text>
                    </View>
                  </Press>
                );
              })}
            </View>
            <Field c={c} label="Label" value={label} onChange={setLabel} placeholder="e.g. Home, Work" />
            <Field c={c} label="Street address" value={line1} onChange={setLine1} placeholder="Street address, apt/unit" autoComplete="street-address" textContentType="fullStreetAddress" />
            <Field c={c} label="City, state ZIP" value={line2} onChange={setLine2} placeholder="City, state ZIP" autoComplete="postal-address-locality" textContentType="addressCityAndState" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <Btn label="Cancel" variant="ghost" flex={1} onPress={reset} />
              <Btn label={editId ? 'Save changes' : 'Save address'} icon="check" flex={1} onPress={save} />
            </View>
          </View>
        ) : (
          <Btn label="Add a new address" icon="plus" variant="ghost" block onPress={openNew} />
        )}
      </ScrollView>
    </Screen>
  );
}

function Field({ c, label, value, onChange, placeholder, autoComplete, textContentType }: { c: any; label: string; value: string; onChange: (t: string) => void; placeholder: string; autoComplete?: any; textContentType?: any }) {
  const [f, setF] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type(12, 800), { color: c.soft }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        accessibilityLabel={label}
        autoComplete={autoComplete}
        textContentType={textContentType}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
        style={[type(15, 600), { color: c.ink, backgroundColor: f ? c.surface : c.bg2, borderWidth: 1.5, borderColor: f ? c.primary : 'transparent', borderRadius: 13, height: 50, paddingHorizontal: 15 }]}
      />
    </View>
  );
}
