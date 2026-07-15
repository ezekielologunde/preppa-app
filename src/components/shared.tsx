import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CartLine } from '../store/store';
import { COOKS, CookId, money, thumb } from '../data/data';
import { computeTotals, Totals } from '../data/totals';
export { computeTotals } from '../data/totals';
export type { Totals } from '../data/totals';
import { useC } from '../theme/ThemeContext';
import { type, radius, shadow, tnum } from '../theme/theme';
import { Icon, Press, Avatar, GradBox } from '../ui';
import { MiniTag } from '../ui/layout';

export function useTotals(cart: CartLine[], tip: number, mode: 'delivery' | 'pickup'): Totals {
  return computeTotals(cart, tip, mode);
}

export function Summary({ t, mode }: { t: Totals; mode: 'delivery' | 'pickup' }) {
  const c = useC();
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.card, margin: 16, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
      <Row label="Subtotal" value={money(t.subtotal)} strong />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text style={[type(14, 600), { color: c.soft }]}>{mode === 'pickup' ? 'Pickup' : 'Delivery'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {t.deliveryFull > 0 ? <Text style={[type(13, 600), { color: c.muted, textDecorationLine: 'line-through' }]}>{money(t.deliveryFull)}</Text> : null}
          <Text style={[type(14, 800), { color: c.green }]}>Free</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[type(14, 600), { color: c.soft }]}>Service fee</Text>
          {t.hasFounder ? <MiniTag label="Founding cook" /> : null}
        </View>
        {t.hasFounder ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[type(13, 600), { color: c.muted, textDecorationLine: 'line-through' }]}>{money(t.serviceFull)}</Text>
            <Text style={[type(14, 800), { color: c.green }]}>$0.00</Text>
          </View>
        ) : (
          <Text style={[type(14, 800), { color: c.ink }]}>{money(t.service)}</Text>
        )}
      </View>
      <Row label="Sales tax" value={money(t.tax)} />
      {t.tip > 0 ? <Row label="Tip · 100% to cook" value={money(t.tip)} strong /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: c.border, borderStyle: 'dashed', marginTop: 8, paddingTop: 14 }}>
        <Text style={[type(17, 900), { color: c.ink }]}>Total</Text>
        <Text style={[type(19, 900), { color: c.ink }, tnum]}>{money(t.total)}</Text>
      </View>
    </View>
  );
}
export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={[type(14, 600), { color: c.soft }]}>{label}</Text>
      <Text style={[type(14, strong ? 800 : 600), { color: strong ? c.ink : c.soft }]}>{value}</Text>
    </View>
  );
}

/** One item line — photo thumbnail + name + qty + line price. Shared by the
 *  checkout "Your order" summary and the order-detail receipt so they never drift. */
export function OrderLineRow({ line, first }: { line: CartLine; first?: boolean }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: c.border2 }}>
      <GradBox grad={line.grad} img={thumb(line.img)} fallbackIcon="utensils" fallbackSize={18} style={{ width: 44, height: 44, borderRadius: radius.md }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type(13.5, 800), { color: c.ink }]}>{line.name}</Text>
        <Text style={[type(12.5, 700), { color: c.soft, marginTop: 2 }]}>Qty {line.qty}</Text>
      </View>
      <Text style={[type(13.5, 800), { color: c.ink }, tnum]}>{money(line.price * line.qty)}</Text>
    </View>
  );
}

/** .cookrow — tappable prepper/kitchen identity row that opens the storefront.
 *  Pass a seed `cook` for the six seeded kitchens, or `name`/`initial` (+ `onPress`)
 *  to render a real kitchen that has no seed CookId. */
export function CookRow({ cook, name, initial, meta, goIcon = 'chevRight', onPress }: { cook?: CookId; name?: string; initial?: string; meta?: string; goIcon?: string; onPress?: () => void }) {
  const c = useC();
  const router = useRouter();
  const cd = cook ? COOKS[cook] : null;
  const displayName = name ?? cd?.name ?? 'Kitchen';
  const metaText = meta ?? (cd ? `${cd.cuisine} · PrepScore ${cd.prepscore}` : '');
  const go = onPress ?? (cook ? () => router.push(`/store/${cook}`) : undefined);
  return (
    <Press scale={0.98} onPress={go}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, padding: 13, borderRadius: radius.lg, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}>
        {cook ? <Avatar cook={cook} size={46} /> : (
          <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[type(19, 900), { color: '#fff' }]}>{initial ?? displayName.trim()[0]?.toUpperCase() ?? 'K'}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[type(15, 900), { color: c.ink }]}>{displayName}</Text>
            <Icon name="shield" size={15} color={c.green} />
          </View>
          {metaText ? <Text style={[type(12, 600), { color: c.soft, marginTop: 2 }]}>{metaText}</Text> : null}
        </View>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={goIcon} size={16} color={c.soft} />
        </View>
      </View>
    </Press>
  );
}

/** Detail hero header buttons (back + actions overlaid on the gradient hero). */
export function HeroTopBar({ topInset, right, onBack }: { topInset: number; right?: React.ReactNode; onBack: () => void }) {
  return (
    <View style={{ position: 'absolute', top: topInset + 14, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between', zIndex: 2 }}>
      <HeroBtn icon="chevLeft" onPress={onBack} label="Go back" />
      {right}
    </View>
  );
}
export function HeroBtn({ icon, onPress, color, label }: { icon: string; onPress?: () => void; color?: string; label?: string }) {
  return (
    <Press scale={0.9} onPress={onPress} hitSlop={6} label={label}>
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={color ?? '#0E0E10'} />
      </View>
    </Press>
  );
}

function BurstRing() {
  return (
    <LinearGradient colors={['#34C759', '#16A34A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', shadowColor: '#16A34A', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 }}>
      <Icon name="check" size={52} color="#fff" />
    </LinearGradient>
  );
}

/** Success burst overlay. */
export function Burst({ title, body, actionLabel, onAction, secondaryLabel, onSecondary }: { title: string; body: React.ReactNode; actionLabel: string; onAction: () => void; secondaryLabel?: string; onSecondary?: () => void }) {
  const c = useC();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <BurstRing />
      <Text style={[type(25, 900), { color: c.ink, marginTop: 22, marginBottom: 8, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type(15, 500), { color: c.soft, textAlign: 'center', maxWidth: 280, lineHeight: 23 }]}>{body}</Text>
      <View style={{ height: 26 }} />
      <PrimaryWide label={actionLabel} onPress={onAction} />
      {secondaryLabel ? (
        <Press scale={0.97} onPress={onSecondary} style={{ marginTop: 10 }}>
          <Text style={[type(15, 800), { color: c.soft }]}>{secondaryLabel}</Text>
        </Press>
      ) : null}
    </View>
  );
}
export function PrimaryWide({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.97} onPress={onPress} style={{ width: '100%', maxWidth: 340 }}>
      <View style={{ height: 56, borderRadius: radius.pill, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
        <Text style={[type(17, 800), { color: '#fff' }]}>{label}</Text>
      </View>
    </Press>
  );
}
