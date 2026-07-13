import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Modal, Pressable, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, GradAvatar, Press } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { money } from '../../src/data/data';
import { KSec, KBtn } from '../(tabs)/my-hub';
import { fetchPrepRollup, fetchCookSubscribers, type PrepDay, type CookSubscriber, type Lifecycle } from '../../src/lib/subscriptions';
import { broadcastAudienceCount, sendBroadcast } from '../../src/lib/messages';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDay(iso: string): string { const d = new Date(iso + 'T00:00:00'); return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}`; }

function lifeChip(c: any, l: Lifecycle): { label: string; bg: string; fg: string } {
  if (l === 'active') return { label: 'Active', bg: c.greenL, fg: c.green };
  if (l === 'paused') return { label: 'Paused', bg: c.bg2, fg: c.muted };
  if (l === 'payment_failed' || l === 'suspended') return { label: 'Payment issue', bg: c.redL, fg: c.red };
  if (l === 'cancellation_scheduled') return { label: 'Ending', bg: c.bg2, fg: c.muted };
  return { label: l, bg: c.bg2, fg: c.soft };
}

export default function SubscribersScreen() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [prep, setPrep] = useState<PrepDay[]>([]);
  const [subs, setSubs] = useState<CookSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([fetchPrepRollup(), fetchCookSubscribers()]);
    setPrep(p); setSubs(s); setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = subs.filter((s) => s.lifecycle === 'active');
  const mrrCents = active.reduce((n, s) => n + s.priceCents, 0);
  const totalPortions = prep.reduce((n, d) => n + d.meals.reduce((m, x) => m + x.portions, 0), 0);

  return (
    <Screen>
      <TopBar title="Subscribers" sub={loading ? '' : `${active.length} active`} onBack={() => router.back()} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : subs.length === 0 && prep.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={26} color={c.primary} /></View>
          <Text style={[type(16, 900), { color: c.ink, marginTop: 12 }]}>No subscribers yet</Text>
          <Text style={[type(13, 600), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 300, lineHeight: 19 }]}>Publish a meal plan and customers can subscribe. Their weekly prep and billing show up here automatically.</Text>
          <View style={{ marginTop: 16, alignSelf: 'stretch', paddingHorizontal: 16 }}><KBtn label="Create a meal plan" variant="pri" block icon="plus" onPress={() => router.push('/hub/create-plan')} /></View>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
          {/* MRR + portions summary */}
          <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 20 }}>
            <Stat c={c} ico="wallet" label="Weekly recurring" value={money(mrrCents / 100)} tint={c.green} />
            <Stat c={c} ico="box" label="Meals this week" value={String(totalPortions)} tint={c.primary} />
          </View>

          {/* This week's prep — what must I cook */}
          <KSec title="What to cook" />
          {prep.length === 0 ? (
            <Text style={[type(13, 600), { color: c.soft, marginHorizontal: 20 }]}>No prep due yet — subscribers’ upcoming weeks will appear here as they lock in.</Text>
          ) : prep.map((d) => (
            <View key={d.deliveryDate} style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 11, backgroundColor: c.bg2 }}>
                <Text style={[type(13.5, 900), { color: c.ink }]}>{fmtDay(d.deliveryDate)}</Text>
                <Text style={[type(12, 700), { color: c.soft }]}>{d.meals.reduce((n, m) => n + m.portions, 0)} portions</Text>
              </View>
              {d.meals.map((m) => (
                <View key={m.mealId} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border2 }}>
                  <Text numberOfLines={1} style={[type(14, 700), { color: c.ink2, flex: 1 }]}>{m.name}</Text>
                  <Text style={[type(14, 900), { color: c.ink, letterSpacing: -0.3 }]}>×{m.portions}</Text>
                </View>
              ))}
              {d.allergens.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 15, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border2, backgroundColor: c.redL }}>
                  <Icon name="info" size={14} color={c.red} />
                  <Text style={[type(12, 700), { color: c.red, flex: 1, lineHeight: 17 }]}>Allergies (customer-provided): {d.allergens.join(', ')}</Text>
                </View>
              ) : null}
            </View>
          ))}

          {/* Roster */}
          <KSec title="Subscribers" />
          <View style={{ marginHorizontal: 20, borderWidth: 1, borderColor: c.border2, borderRadius: 18, overflow: 'hidden' }}>
            {subs.length === 0 ? (
              <Text style={[type(13, 600), { color: c.soft, padding: 15 }]}>No plan subscribers yet.</Text>
            ) : subs.map((s, i) => {
              const ch = lifeChip(c, s.lifecycle);
              return (
                <View key={s.subscriptionId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: c.surface, borderBottomWidth: i === subs.length - 1 ? 0 : 1, borderBottomColor: c.border2 }}>
                  <GradAvatar grad="g2" letter={(s.customerName[0] ?? '?').toUpperCase()} size={40} rad={13} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type(14.5, 800), { color: c.ink, letterSpacing: -0.2 }]}>{s.customerName}</Text>
                    <Text numberOfLines={1} style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{s.planName} · {money(s.priceCents / 100)}/wk{s.preferredDay ? ` · ${s.preferredDay}` : ''}</Text>
                  </View>
                  <Text style={[type(11.5, 800), { color: ch.fg, backgroundColor: ch.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' }]}>{ch.label}</Text>
                </View>
              );
            })}
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
            <KBtn label="Message all subscribers" variant="ghost" block icon="mega" onPress={() => setBroadcastOpen(true)} />
          </View>
        </ScrollView>
      )}
      <BroadcastComposer open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
    </Screen>
  );
}

/** Compose one message that fans out to every subscriber's 1:1 thread (replies come back 1:1). */
function BroadcastComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useC();
  const { toast } = useStore();
  const [body, setBody] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const idemKey = useRef('');

  useEffect(() => {
    if (!open) return;
    setBody('');
    setCount(null);
    // one idempotency key per compose session — a double-tap Send can't send twice
    idemKey.current = `bc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    broadcastAudienceCount().then(setCount).catch(() => setCount(0));
  }, [open]);

  const send = async () => {
    const text = body.trim();
    if (text.length < 1 || sending) return;
    setSending(true);
    try {
      const res = await sendBroadcast(text, idemKey.current);
      toast(res.recipientCount > 0 ? `Sent to ${res.recipientCount} subscriber${res.recipientCount !== 1 ? 's' : ''}` : 'No subscribers to message yet', 'check', res.recipientCount > 0);
      onClose();
    } catch (e: any) {
      const msg = String(e?.message || '');
      toast(msg.includes('rate_limit') ? 'You can send up to 3 broadcasts per day' : (msg || 'Couldn’t send'), 'info');
    } finally { setSending(false); }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' }}>
        <Pressable onPress={(e) => e.stopPropagation?.()} style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: 18, paddingBottom: 26 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="mega" size={18} color={c.primary} />
            <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.4, flex: 1 }]}>Message subscribers</Text>
            <Press onPress={onClose} label="Close"><Icon name="x" size={20} color={c.muted} /></Press>
          </View>
          <Text style={[type(12.5, 600), { color: c.soft, marginTop: 6, lineHeight: 18 }]}>
            {count === null ? 'Counting your subscribers…'
              : count === 0 ? 'You have no active subscribers to message yet.'
              : `Goes to all ${count} subscriber${count !== 1 ? 's' : ''} as a private 1:1 message — replies come straight back to you.`}
          </Text>
          <View style={{ marginTop: 12, borderWidth: 1, borderColor: c.border2, borderRadius: radius.md, backgroundColor: c.bg2, padding: 12, minHeight: 96 }}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="e.g. This week’s menu is live — order by Thursday 6pm 🍜"
              placeholderTextColor={c.muted}
              multiline
              maxLength={2000}
              style={[type(14, 500), { color: c.ink, minHeight: 72, textAlignVertical: 'top' }]}
            />
          </View>
          <View style={{ marginTop: 14 }}>
            <KBtn
              label={sending ? 'Sending…' : count && count > 0 ? `Send to ${count}` : 'Send'}
              variant="pri" block icon="send"
              onPress={body.trim() && count && count > 0 && !sending ? send : undefined}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ c, ico, label, value, tint }: { c: any; ico: string; label: string; value: string; tint: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 16, padding: 14 }}>
      <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Icon name={ico} size={15} color={tint} /></View>
      <Text style={[type(20, 900), { color: c.ink, letterSpacing: -0.6, marginTop: 9 }]}>{value}</Text>
      <Text style={[type(11.5, 700), { color: c.muted, marginTop: 1 }]}>{label}</Text>
    </View>
  );
}
