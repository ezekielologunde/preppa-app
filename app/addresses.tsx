import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, MiniTag, Empty } from '../src/ui/layout';
import { addressLocality, type SavedAddress } from '../src/lib/addresses';
import { confirmAction } from '../src/lib/confirm';

export default function Addresses() {
  const c = useC();
  const router = useRouter();
  const { select } = useLocalSearchParams<{ select?: string }>();
  const selecting = select === '1';
  const { addresses, addressId, addressesLoading, addressesError, refreshAddresses, selectAddress, removeAddress, addAddress, updateAddress, toast } = useStore();

  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');
  const [busy, setBusy] = useState(false);
  const addressActionInFlight = useRef(false);

  const reset = () => { setAdding(false); setEditId(null); setLabel(''); setLine1(''); setLine2(''); setCity(''); setRegion(''); setPostalCode(''); setCountry('US'); };
  const openNew = () => { reset(); setAdding(true); };
  const openEdit = (a: SavedAddress) => {
    setEditId(a.id); setLabel(a.label); setLine1(a.line1); setLine2(a.line2); setCity(a.city); setRegion(a.region); setPostalCode(a.postalCode); setCountry(a.country); setAdding(true);
  };

  const pick = (id: string) => {
    selectAddress(id);
    if (selecting) {
      toast('Delivery address updated', 'pin', true);
      router.back();
    }
  };

  const save = async () => {
    if (addressActionInFlight.current) return;
    if (!label.trim() || !line1.trim() || !city.trim() || !region.trim() || !postalCode.trim() || !/^[A-Za-z]{2}$/.test(country.trim())) {
      toast('Add a complete address with a two-letter country code', 'info');
      return;
    }
    addressActionInFlight.current = true;
    const patch = { label: label.trim(), line1: line1.trim(), line2: line2.trim(), city: city.trim(), region: region.trim(), postalCode: postalCode.trim(), country: country.trim().toUpperCase() };
    setBusy(true);
    try {
      if (editId) {
        await updateAddress(editId, patch);
        toast('Address updated', 'pin', true);
      } else {
        const id = await addAddress(patch);
        const wasDuplicate = addresses.some((a) => a.id === id);
        toast(wasDuplicate ? 'That address is already saved and selected' : 'Address added', 'pin', true);
      }
      reset();
    } catch (e: any) {
      toast(e?.message === 'AUTH_REQUIRED' ? 'Sign in to save an address.' : (e?.message || 'Could not save this address.'), 'info');
    } finally { addressActionInFlight.current = false; setBusy(false); }
  };

  const remove = async (id: string) => {
    if (addressActionInFlight.current) return;
    addressActionInFlight.current = true;
    setBusy(true);
    try { await removeAddress(id); toast('Address removed', 'x'); }
    catch (e: any) { toast(e?.message || 'Could not remove this address.', 'info'); }
    finally { addressActionInFlight.current = false; setBusy(false); }
  };

  const requestRemove = (address: SavedAddress) => {
    confirmAction(
      `Remove ${address.label}?`,
      `${address.line1}${addressLocality(address) ? `, ${addressLocality(address)}` : ''} will no longer be available at checkout.`,
      () => { void remove(address.id); },
      'Remove address',
    );
  };

  if (addressesLoading && addresses.length === 0) return <Screen><TopBar title="Addresses" /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;
  if (addressesError && addresses.length === 0) return <Screen><TopBar title="Addresses" /><Empty icon="info" title="Couldn’t load addresses" body={addressesError} action={<Btn label="Try again" icon="repeat" onPress={() => { void refreshAddresses(); }} />} /></Screen>;

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
              <Press scale={0.99} onPress={() => pick(a.id)} label={`Use ${a.label} address`} role="radio" checked={on} disabled={busy} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
                  <Text numberOfLines={1} style={[type(12.5, 500), { color: c.muted, marginTop: 1 }]}>{addressLocality(a) || 'Complete this address before checkout'}</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} /> : null}
                </View>
              </Press>
              <Press scale={0.9} onPress={() => openEdit(a)} label={`Edit ${a.label} address`} hitSlop={8} disabled={busy}>
                <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="edit" size={15} color={c.muted} />
                </View>
              </Press>
              <Press scale={0.9} onPress={() => requestRemove(a)} disabled={busy} label={`Remove ${a.label} address`} hitSlop={8}>
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
            <Field c={c} label="Street address" value={line1} onChange={setLine1} placeholder="123 Main St" autoComplete="street-address" textContentType="fullStreetAddress" />
            <Field c={c} label="Apartment or unit (optional)" value={line2} onChange={setLine2} placeholder="Apt 4B" />
            <Field c={c} label="City" value={city} onChange={setCity} placeholder="Atlanta" autoComplete="postal-address-locality" textContentType="addressCity" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Field c={c} label="State or region" value={region} onChange={setRegion} placeholder="GA" autoComplete="postal-address-region" textContentType="addressState" /></View>
              <View style={{ flex: 1 }}><Field c={c} label="Postal code" value={postalCode} onChange={setPostalCode} placeholder="30312" autoComplete="postal-code" textContentType="postalCode" /></View>
            </View>
            <Field c={c} label="Country code" value={country} onChange={(value) => setCountry(value.toUpperCase().slice(0, 2))} placeholder="US" autoComplete="country" textContentType="countryCode" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <Btn label="Cancel" variant="ghost" flex={1} onPress={reset} />
              <Btn label={editId ? 'Save changes' : 'Save address'} icon="check" flex={1} loading={busy} onPress={save} />
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
