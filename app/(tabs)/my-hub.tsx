import React, { useState } from 'react';
import { View, Text, ScrollView, StyleProp, ViewStyle, TextInput, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Redirect, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { Palette, GradKey, type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox } from '../../src/ui';
import { money } from '../../src/data/data';
import { ME } from '../../src/data/cook';
import { fetchDashboardSummary, fetchKitchenOrders, updateOrderStatus, KitchenDashboardSummary, KitchenOrderRow } from '../../src/lib/orders';

export type Tone = 'ic-amber' | 'ic-green' | 'ic-purple' | 'ic-blue' | 'ic-ink' | 'ic-red';
export function well(c: Palette, t: Tone): [string, string] {
  switch (t) {
    case 'ic-amber': return [c.primaryL, c.primary];
    case 'ic-green': return [c.greenL, c.green];
    case 'ic-purple': return [c.purpleL, c.purple];
    case 'ic-blue': return [c.blueL, c.blue];
    case 'ic-ink': return [c.bg2, c.ink];
    case 'ic-red': return [c.pinkL, c.red];
  }
}

/* ---------- availability pill toggle ---------- */
export function AvailToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const c = useC();
  return (
    <Press scale={0.94} onPress={onToggle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, height: 38, paddingLeft: 14, paddingRight: 6, borderRadius: radius.pill, backgroundColor: on ? c.greenL : c.bg2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: on ? c.green2 : c.muted }} />
          <Text style={[type(13.5, 800), { color: on ? '#0f7a39' : c.soft, letterSpacing: -0.1 }]}>{on ? 'Open' : 'Paused'}</Text>
        </View>
        <View style={[{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}>
          <Icon name={on ? 'power' : 'pause'} size={15} color={on ? c.green : c.muted} />
        </View>
      </View>
    </Press>
  );
}

/* ---------- hub header (avatar + eyebrow/name + toggle + bell) ---------- */
export function HubHeader({ eyebrow = 'My Hub', name, showBell, right, onBack, below, noAvail }: { eyebrow?: string; name: string; showBell?: boolean; right?: React.ReactNode; onBack?: () => void; below?: React.ReactNode; noAvail?: boolean }) {
  const c = useC();
  const insets = useSafeAreaInsets();
  const { avail, toggleAvail, toast } = useStore();
  return (
    <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 10, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {onBack ? (
          <Press scale={0.9} onPress={onBack}>
            <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevLeft" size={20} color={c.ink2} />
            </View>
          </Press>
        ) : (
          <GradBox grad={ME.grad} style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[type(17, 900), { color: '#fff' }]}>{(name || '?').trim()[0]?.toUpperCase() ?? '?'}</Text>
          </GradBox>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type(10.5, 800), { color: c.muted, letterSpacing: 0.6, textTransform: 'uppercase' }]}>{eyebrow}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text numberOfLines={1} style={[type(18, 900), { color: c.ink, letterSpacing: -0.5 }]}>{name}</Text>
            {onBack ? null : <Icon name="shield" size={15} color={c.green} />}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          {noAvail ? null : <AvailToggle on={avail} onToggle={toggleAvail} />}
          {right}
          {showBell ? (
            <Press scale={0.9} onPress={() => toast('No new alerts', 'bell')}>
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={19} color={c.ink2} />
                <View style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary, borderWidth: 2, borderColor: c.bg2 }} />
              </View>
            </Press>
          ) : null}
        </View>
      </View>
      {below ? <View style={{ marginTop: 16 }}>{below}</View> : null}
    </View>
  );
}

/* ---------- segmented control ---------- */
export function KSeg({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', gap: 5, backgroundColor: c.bg2, padding: 5, borderRadius: 14 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Press key={o.key} scale={0.97} onPress={() => onChange(o.key)} style={{ flex: 1 }}>
            <View style={{ height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface : 'transparent', ...(on ? shadow.soft : {}) }}>
              <Text style={[type(13.5, 800), { color: on ? c.ink : c.soft }]}>{o.label}</Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}

/* ---------- section header ---------- */
export function KSec({ title, count, link, onLink }: { title: string; count?: number; link?: string; onLink?: () => void }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 26, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={[type(17, 900), { color: c.ink, letterSpacing: -0.5 }]}>{title}</Text>
        {count != null && count > 0 ? <Text style={[type(13, 800), { color: c.muted, marginLeft: 8 }]}>{count}</Text> : null}
      </View>
      {link ? <Press onPress={onLink}><Text style={[type(13.5, 800), { color: c.accentText }]}>{link}</Text></Press> : null}
    </View>
  );
}

/* ---------- status pill ---------- */
export function KPill({ label, bg, fg, dot }: { label: string; bg: string; fg: string; dot?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} /> : null}
      <Text style={[type(11, 800), { color: fg }]}>{label}</Text>
    </View>
  );
}

/* ---------- small pill button ---------- */
export function KBtn({ label, variant = 'pri', sm, block, icon, onPress, flex, style, height }: { label: string; variant?: 'pri' | 'dark' | 'ghost'; sm?: boolean; block?: boolean; icon?: string; onPress?: () => void; flex?: number; style?: StyleProp<ViewStyle>; height?: number }) {
  const c = useC();
  const bg = variant === 'pri' ? c.primary : variant === 'dark' ? c.ink : c.bg2;
  const fg = variant === 'ghost' ? c.ink : variant === 'dark' ? c.surface : '#fff';
  const h = height ?? (block ? 48 : sm ? 32 : 36);
  return (
    <Press scale={0.94} onPress={onPress} style={[block ? { width: '100%' } : null, flex ? { flex } : null, style]}>
      <View style={{ height: h, paddingHorizontal: sm ? 12 : 16, borderRadius: radius.pill, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, ...(variant === 'pri' ? shadow.brand : {}) }}>
        {icon ? <Icon name={icon} size={sm ? 14 : 16} color={fg} /> : null}
        <Text style={[type(block ? 15 : sm ? 12.5 : 13, 800), { color: fg }]}>{label}</Text>
      </View>
    </Press>
  );
}

/* ---------- balance strip (dark card) ---------- */
export function BalanceStrip({ summary }: { summary: KitchenDashboardSummary | null }) {
  const c = useC();
  const router = useRouter();
  const availableDollars = (summary?.available_cents ?? 0) / 100;
  const todayDollars = (summary?.today_cents ?? 0) / 100;
  return (
    <View style={{ marginHorizontal: 20, marginTop: 18, padding: 18, borderRadius: 22, backgroundColor: c.feature, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', right: -50, top: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(242,107,29,.28)' }} />
      <Press scale={0.93} onPress={() => router.push('/hub/money')} style={{ position: 'absolute', right: 18, top: 18, zIndex: 2 }}>
        <View style={{ height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: c.primaryD, flexDirection: 'row', alignItems: 'center', gap: 6, ...shadow.brand }}>
          <Icon name="bank" size={15} color="#fff" />
          <Text style={[type(13.5, 800), { color: '#fff' }]}>Pay out</Text>
        </View>
      </Press>
      <Text style={[type(12, 800), { color: 'rgba(255,255,255,.6)', letterSpacing: 0.5, textTransform: 'uppercase' }]}>Available balance</Text>
      <Text style={[type(34, 900), { color: '#fff', letterSpacing: -1.2, marginTop: 5 }]}>{summary ? money(availableDollars) : '—'}</Text>
      <View style={{ flexDirection: 'row', gap: 18, marginTop: 14 }}>
        <View>
          <Text style={[type(15, 900), { color: '#fff', letterSpacing: -0.3 }]}>{summary ? money(todayDollars) : '—'}</Text>
          <Text style={[type(11.5, 700), { color: 'rgba(255,255,255,.6)', marginTop: 2 }]}>Today · {summary?.today_orders ?? 0} orders</Text>
        </View>
        <View>
          <Text style={[type(15, 900), { color: '#fff', letterSpacing: -0.3 }]}>{summary?.pending_orders ?? 0}</Text>
          <Text style={[type(11.5, 700), { color: 'rgba(255,255,255,.6)', marginTop: 2 }]}>Need prep</Text>
        </View>
      </View>
    </View>
  );
}

/* ---------- stat tile ---------- */
export function StatTile({ ic, tone, value, label, delta, deltaDir, onPress }: { ic: string; tone: Tone; value: string; label: string; delta?: string; deltaDir?: 'up' | 'flat' | 'dn'; onPress?: () => void }) {
  const c = useC();
  const [bg, fg] = well(c, tone);
  const dc = deltaDir === 'up' ? c.green : deltaDir === 'dn' ? c.red : c.muted;
  return (
    <Press scale={0.98} onPress={onPress} style={{ flex: 1 }}>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, padding: 15 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 11 }}>
          <Icon name={ic} size={18} color={fg} />
        </View>
        <Text numberOfLines={1} style={[type(23, 900), { color: c.ink, letterSpacing: -0.8 }]}>{value}</Text>
        <Text numberOfLines={1} style={[type(12.5, 700), { color: c.soft, marginTop: 5 }]}>{label}</Text>
        {delta ? <Text style={[type(11.5, 800), { color: dc, marginTop: 7 }]}>{delta}</Text> : null}
      </View>
    </Press>
  );
}

/* ---------- action card ---------- */
interface QItem {
  k: string; kind: 'warn' | 'new' | 'cater' | 'win'; tag: string; tone: Tone; ic: string;
  ttl: string; mt: React.ReactNode; when?: string;
  btn: string; btnVariant: 'pri' | 'dark'; onPrimary: () => void;
  sub?: { label: string; onPress: () => void };
}
function ActionCard({ it }: { it: QItem }) {
  const c = useC();
  const [bg, fg] = well(c, it.tone);
  const bar = it.kind === 'new' ? c.primary : it.kind === 'cater' ? c.purple : it.kind === 'win' ? c.green2 : c.star;
  const tag: [string, string] = it.kind === 'new' ? [c.primaryL, c.primaryD] : it.kind === 'cater' ? [c.purpleL, c.purple] : it.kind === 'win' ? [c.greenL, '#0f7a39'] : [c.primaryL, '#B45309'];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, padding: 14, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: bar }} />
      <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={it.ic} size={20} color={fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Text style={[type(10, 900), { color: tag[1], backgroundColor: tag[0], letterSpacing: 0.4, textTransform: 'uppercase', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }]}>{it.tag}</Text>
          {it.when ? <Text style={[type(11, 700), { color: c.muted }]}>{it.when}</Text> : null}
        </View>
        <Text style={[type(14.5, 800), { color: c.ink, letterSpacing: -0.3, marginTop: 4 }]}>{it.ttl}</Text>
        <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{it.mt}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <KBtn label={it.btn} variant={it.btnVariant} onPress={it.onPrimary} />
        {it.sub ? <KBtn label={it.sub.label} variant="ghost" sm onPress={it.sub.onPress} /> : null}
      </View>
    </View>
  );
}

/* ---------- form primitives (create meal / plan / bid / payout) ---------- */
export function KField({ label, hint, children }: { label?: string; hint?: string; children: React.ReactNode }) {
  const c = useC();
  return (
    <View style={{ marginTop: 20 }}>
      {label ? (
        <Text style={[type(13, 800), { color: c.ink, marginBottom: 9, letterSpacing: -0.1 }]}>
          {label}
          {hint ? <Text style={[type(12, 600), { color: c.muted }]}>{'  ' + hint}</Text> : null}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function KInput({ value, onChange, placeholder, multiline }: { value: string; onChange: (t: string) => void; placeholder?: string; multiline?: boolean }) {
  const c = useC();
  const [f, setF] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      multiline={multiline}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      style={[type(15, 600), { color: c.ink, backgroundColor: f ? c.surface : c.bg2, borderWidth: 1.5, borderColor: f ? c.primary : 'transparent', borderRadius: 13, paddingHorizontal: 15 }, multiline ? { minHeight: 92, paddingVertical: 13, textAlignVertical: 'top' } : { height: 50 }]}
    />
  );
}

export function MoneyInput({ value, onChange, placeholder = '0.00', big }: { value: string; onChange: (t: string) => void; placeholder?: string; big?: boolean }) {
  const c = useC();
  const [f, setF] = useState(false);
  return (
    <View>
      <View style={{ position: 'absolute', left: 15, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 }}>
        <Text style={[type(big ? 18 : 15, 800), { color: c.soft }]}>$</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        keyboardType="decimal-pad"
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
        style={[type(big ? 18 : 15, big ? 900 : 600), { color: c.ink, backgroundColor: f ? c.surface : c.bg2, borderWidth: 1.5, borderColor: f ? c.primary : 'transparent', borderRadius: 13, height: 50, paddingLeft: 32, paddingRight: 15 }]}
      />
    </View>
  );
}

export function KChoice({ label, on, onPress, check }: { label: string; on: boolean; onPress: () => void; check?: boolean }) {
  const c = useC();
  return (
    <Press scale={0.96} onPress={onPress}>
      <View style={{ height: 42, paddingHorizontal: 16, borderRadius: 12, backgroundColor: on ? c.primaryL : c.bg2, borderWidth: 1.5, borderColor: on ? c.primary : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {check && on ? <Icon name="check" size={13} color={c.primaryD} /> : null}
        <Text style={[type(13.5, 800), { color: on ? c.primaryD : c.soft }]}>{label}</Text>
      </View>
    </Press>
  );
}

const PHOTO_GRADS: GradKey[] = ['g4', 'g1', 'g6', 'g3', 'g7', 'g8'];
export function PhotoPick({ grad, setGrad }: { grad: GradKey | null; setGrad: (g: GradKey) => void }) {
  const c = useC();
  if (grad) {
    return (
      <Press scale={0.98} onPress={() => setGrad(PHOTO_GRADS[(PHOTO_GRADS.indexOf(grad) + 1) % PHOTO_GRADS.length])}>
        <GradBox grad={grad} style={{ height: 150, borderRadius: 16, justifyContent: 'flex-end', alignItems: 'flex-end', padding: 12 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" size={18} color="#fff" />
          </View>
        </GradBox>
      </Press>
    );
  }
  return (
    <Press scale={0.98} onPress={() => setGrad(PHOTO_GRADS[0])}>
      <View style={{ height: 150, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: c.border, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center', gap: 9 }}>
        <Icon name="camera" size={26} color={c.muted} />
        <Text style={[type(13.5, 700), { color: c.muted }]}>Add a photo of your dish</Text>
      </View>
    </Press>
  );
}

const SHORTCUTS: { route: string; ic: string; tone: Tone; l: string }[] = [
  { route: '/hub/orders', ic: 'box', tone: 'ic-amber', l: 'Orders' },
  { route: '/messages', ic: 'comment', tone: 'ic-purple', l: 'Messages' },
  { route: '/hub/requests', ic: 'users', tone: 'ic-purple', l: 'Requests' },
  { route: '/hub/money', ic: 'wallet', tone: 'ic-green', l: 'Earnings' },
  { route: '/hub/pro', ic: 'bolt', tone: 'ic-amber', l: 'Preppa Pro' },
  { route: '/hub/menu', ic: 'utensils', tone: 'ic-ink', l: 'My menu' },
  { route: '/hub/fulfillment', ic: 'truck', tone: 'ic-blue', l: 'Delivery & pickup' },
  { route: '/hub/experiences', ic: 'spark', tone: 'ic-red', l: 'Experiences' },
  { route: '/hub/create-meal', ic: 'plus', tone: 'ic-amber', l: 'Add meal' },
  { route: '/hub/subscribers', ic: 'users', tone: 'ic-green', l: 'Subscribers' },
  { route: '/hub/analytics', ic: 'bars', tone: 'ic-blue', l: 'Analytics' },
  { route: '/hub/post-reel', ic: 'play', tone: 'ic-purple', l: 'Post reel' },
  { route: '/hub/go-live', ic: 'video', tone: 'ic-red', l: 'Go live' },
  { route: '/hub/tickets', ic: 'info', tone: 'ic-blue', l: 'Support' },
];

/** Shortcut tiles — measured pixel widths (3 col phone / 4 tablet / 6 desktop).
 *  Pixel width on a Press resolves correctly; a percentage width would collapse. */
function ShortcutsGrid() {
  const c = useC();
  const router = useRouter();
  const [w, setW] = useState(0);
  const cols = w >= 1000 ? 6 : w >= 700 ? 4 : 3;
  const gap = 11;
  const cardW = w > 0 ? (w - gap * (cols - 1)) / cols : 0;
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {w > 0 && SHORTCUTS.map((s) => {
          const [bg, fg] = well(c, s.tone);
          return (
            <Press key={s.route} scale={0.96} onPress={() => router.push(s.route as any)} style={{ width: cardW }}>
              <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, paddingVertical: 15, paddingHorizontal: 12, gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={s.ic} size={19} color={fg} />
                </View>
                <Text numberOfLines={1} style={[type(13, 800), { color: c.ink, letterSpacing: -0.3 }]}>{s.l}</Text>
              </View>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

export default function MyHub() {
  const c = useC();
  const router = useRouter();
  const { ready, avail, toggleAvail, toast, prepperStatus, name, firstName } = useStore();
  const [dir, setDir] = useState<'focus' | 'brief'>('focus');
  const [summary, setSummary] = useState<KitchenDashboardSummary | null>(null);
  const [needsPrep, setNeedsPrep] = useState<KitchenOrderRow[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = React.useCallback(() => {
    fetchDashboardSummary().then(setSummary).catch(() => {});
    fetchKitchenOrders().then((rows) => setNeedsPrep(rows.filter((r) => r.status === 'confirmed'))).catch(() => {});
  }, []);
  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  if (!ready) return null; // wait for persisted role to hydrate before deciding — otherwise the guard below is skipped
  if (prepperStatus !== 'approved') return <Redirect href="/(tabs)/home" />; // prepper-only

  const startPrep = async (orderId: string) => {
    setActingOn(orderId);
    try {
      await updateOrderStatus(orderId, 'preparing');
      setNeedsPrep((rows) => rows.filter((r) => r.order_id !== orderId));
      toast('Order moved to preparing', 'check', true);
    } catch (e: any) {
      toast(e?.message || 'Could not update this order.', 'info');
    } finally {
      setActingOn(null);
    }
  };

  // Real "needs attention" queue (audit Critical: this used to be built from permanently-
  // empty mock arrays — ORDERS/CATER_INCOMING/MY_BIDS — so it always rendered "All caught up"
  // regardless of real order activity).
  const queue: QItem[] = [];
  if (!avail) {
    queue.push({ k: 'paused', kind: 'warn', tag: 'Paused', tone: 'ic-amber', ic: 'pause', ttl: 'Your kitchen is paused', mt: 'New customers can’t order until you reopen.', btn: 'Reopen', btnVariant: 'dark', onPrimary: toggleAvail });
  }
  needsPrep.forEach((o) => {
    queue.push({
      k: o.order_id, kind: 'new', tag: 'New order', tone: 'ic-amber', ic: 'box',
      ttl: `${o.first_item_qty ?? 1}× ${o.first_item_name ?? 'Order'}${o.item_count > 1 ? ` +${o.item_count - 1} more` : ''}`,
      mt: <Text style={[type(12.5, 600), { color: c.soft }]}><Text style={[type(12.5, 800), { color: c.ink }]}>{o.buyer_name ?? 'Customer'}</Text> · {money(o.total_cents / 100)} · {o.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}</Text>,
      btn: actingOn === o.order_id ? 'Starting…' : 'Start preparing', btnVariant: 'pri',
      onPrimary: () => startPrep(o.order_id),
    });
  });

  const queueBlock = (
    <>
      <KSec title="Needs your attention" count={queue.length} />
      <View style={{ paddingHorizontal: 20, gap: 11 }}>
        {queue.length > 0 ? (
          queue.map((it) => <ActionCard key={it.k} it={it} />)
        ) : (
          <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, paddingVertical: 34, paddingHorizontal: 24, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.greenL, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name="check" size={28} color={c.green} />
            </View>
            <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>All caught up</Text>
            <Text style={[type(13.5, 500), { color: c.soft, marginTop: 5, textAlign: 'center' }]}>No orders or requests waiting. Nicely done.</Text>
          </View>
        )}
      </View>
    </>
  );

  const shortcutsBlock = (
    <>
      <KSec title="Shortcuts" />
      <ShortcutsGrid />
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HubHeader name={name || firstName || 'Your kitchen'} showBell below={<KSeg options={[{ key: 'focus', label: 'Focus' }, { key: 'brief', label: 'Dashboard' }]} value={dir} onChange={(k) => setDir(k as 'focus' | 'brief')} />} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        <BalanceStrip summary={summary} />

        {dir === 'focus' ? (
          <>
            {queueBlock}
            <KSec title="This week" link="Analytics" onLink={() => router.push('/hub/analytics')} />
            <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20 }}>
              <StatTile ic="wallet" tone="ic-green" value={summary ? money(summary.week_cents / 100) : '—'} label="Earnings" onPress={() => router.push('/hub/money')} />
              <StatTile ic="box" tone="ic-amber" value={String(summary?.pending_orders ?? 0)} label="Need prep" onPress={() => router.push('/hub/orders')} />
            </View>
            {shortcutsBlock}
          </>
        ) : (
          <>
            <KSec title="Today" />
            <View style={{ paddingHorizontal: 20, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <StatTile ic="wallet" tone="ic-green" value={summary ? money(summary.today_cents / 100) : '—'} label="Earnings today" onPress={() => router.push('/hub/money')} />
                <StatTile ic="box" tone="ic-amber" value={String(summary?.today_orders ?? 0)} label="Orders today" onPress={() => router.push('/hub/orders')} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <StatTile ic="star" tone="ic-blue" value="—" label="No reviews yet" onPress={() => router.push('/hub/analytics')} />
                <StatTile ic="users" tone="ic-purple" value={String(summary?.pending_orders ?? 0)} label="Need prep" onPress={() => router.push('/hub/orders')} />
              </View>
            </View>
            {queueBlock}
            {shortcutsBlock}
          </>
        )}
      </ScrollView>
    </View>
  );
}
