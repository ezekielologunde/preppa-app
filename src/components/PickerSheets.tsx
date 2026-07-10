import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { useStore } from '../store/store';
import { Icon, Press, Btn, Sheet } from '../ui';
import { SavedCard } from '../lib/payments';

/** Quick delivery-address picker (bottom sheet) — stays in checkout context. */
export function AddressPickerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useC();
  const router = useRouter();
  const { addresses, addressId, selectAddress, toast } = useStore();
  const pick = (id: string) => { selectAddress(id); toast('Delivery address updated', 'pin', true); onClose(); };
  return (
    <Sheet visible={visible} onClose={onClose} title="Delivery address" scroll>
      {addresses.length === 0 ? (
        <Text style={[type(14, 500), { color: c.soft, paddingHorizontal: 4, paddingVertical: 10 }]}>No saved addresses yet.</Text>
      ) : (
        addresses.map((a) => {
          const on = a.id === addressId;
          return (
            <Press key={a.id} scale={0.99} onPress={() => pick(a.id)} label={`Use ${a.label}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: on ? c.primaryL : 'transparent' }}>
                <Icon name="pin" size={18} color={on ? c.primary : c.soft} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type(14.5, 800), { color: c.ink }]}>{a.label}</Text>
                  <Text numberOfLines={1} style={[type(12.5, 500), { color: c.soft, marginTop: 2 }]}>{a.line1}</Text>
                </View>
                {on ? <Icon name="check" size={18} color={c.primary} /> : null}
              </View>
            </Press>
          );
        })
      )}
      <View style={{ marginTop: 8 }}>
        <Btn label="Manage addresses" icon="plus" variant="ghost" block onPress={() => { onClose(); router.push('/addresses'); }} />
      </View>
    </Sheet>
  );
}

/**
 * Quick payment-method picker (bottom sheet) — controlled by checkout, which owns
 * the saved-card list (via `useSavedCards`). `selectedId === null` means "use a new
 * card". Choosing a card here just sets checkout's selection; the actual charge
 * happens on Pay.
 */
export function CardPickerSheet({
  visible,
  onClose,
  methods,
  selectedId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  methods: SavedCard[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const c = useC();
  const router = useRouter();
  const brand = (b: string) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');
  const pick = (id: string | null) => { onSelect(id); onClose(); };
  return (
    <Sheet visible={visible} onClose={onClose} title="Payment method" scroll>
      {methods.map((cd) => {
        const on = cd.id === selectedId;
        return (
          <Press key={cd.id} scale={0.99} onPress={() => pick(cd.id)} label={`Use ${brand(cd.brand)} ending ${cd.last4}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: on ? c.primaryL : 'transparent' }}>
              <Icon name="card" size={18} color={on ? c.primary : c.soft} />
              <Text style={[type(14.5, 800), { color: c.ink, flex: 1 }]}>{brand(cd.brand)} •••• {cd.last4}</Text>
              {on ? <Icon name="check" size={18} color={c.primary} /> : null}
            </View>
          </Press>
        );
      })}
      <Press scale={0.99} onPress={() => pick(null)} label="Use a new card">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: selectedId === null ? c.primaryL : 'transparent' }}>
          <Icon name="plus" size={18} color={selectedId === null ? c.primary : c.soft} />
          <Text style={[type(14.5, 800), { color: c.ink, flex: 1 }]}>Use a new card</Text>
          {selectedId === null ? <Icon name="check" size={18} color={c.primary} /> : null}
        </View>
      </Press>
      <View style={{ marginTop: 8 }}>
        <Btn label="Manage cards" icon="settings" variant="ghost" block onPress={() => { onClose(); router.push('/payments'); }} />
      </View>
    </Sheet>
  );
}
