import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Screen, Block, Empty, Btn, Press, Icon } from '../../src/ui';
import { useStore } from '../../src/store/store';
import { useAdminPayouts } from '../../src/data/hooks';
import * as admin from '../../src/lib/admin';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { money } from '../../src/data/data';

const FILTERS: { label: string; value: admin.AdminPayoutStatus | undefined }[] = [
  { label: 'Needs review', value: 'needs_review' },
  { label: 'Pending', value: 'pending' },
  { label: 'Paid', value: 'paid' },
  { label: 'Failed', value: 'failed' },
  { label: 'All', value: undefined },
];

function when(iso: string): string { try { return new Date(iso).toLocaleString(); } catch { return ''; } }

function StatusPill({ status }: { status: admin.AdminPayoutStatus }) {
  const c = useC();
  const map: Record<admin.AdminPayoutStatus, { label: string; fg: string; bg: string }> = {
    paid: { label: 'Paid', fg: c.green, bg: c.greenL },
    pending: { label: 'Pending', fg: c.primary, bg: c.primaryL },
    needs_review: { label: 'Needs review', fg: c.red, bg: c.redL },
    failed: { label: 'Failed', fg: c.red, bg: c.redL },
  };
  const s = map[status];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: s.bg }}>
      <Text style={[type(11.5, 800), { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

function ResolveRow({ payout, onChanged }: { payout: admin.AdminPayout; onChanged: () => void }) {
  const c = useC();
  const { toast } = useStore();
  const [transferId, setTransferId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const resolve = async (outcome: 'paid' | 'failed') => {
    if (outcome === 'paid' && transferId.trim().length < 4) {
      toast('Enter the Stripe transfer id (find it by searching the idempotency key below in the Stripe dashboard)', 'info');
      return;
    }
    setBusy(true);
    try {
      await admin.resolvePayout(payout.id, outcome, transferId.trim() || undefined, note.trim() || undefined);
      toast(outcome === 'paid' ? 'Marked paid' : 'Marked failed', 'check', true);
      onChanged();
    } catch (e: any) {
      toast(e?.message ?? 'Could not resolve this payout', 'info');
    } finally { setBusy(false); }
  };

  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: c.border2, paddingTop: 12, gap: 10 }}>
      <Text style={[type(12, 600), { color: c.soft }]}>
        Search the Stripe dashboard for idempotency key <Text style={[type(12, 800), { color: c.ink }]}>{`payout_${payout.id}`}</Text> to find the real transfer (or confirm none exists).
      </Text>
      <TextInput
        value={transferId}
        onChangeText={setTransferId}
        placeholder="tr_… (required to mark paid)"
        placeholderTextColor={c.muted}
        style={{ height: 42, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 12, color: c.ink, backgroundColor: c.bg2, ...(type(13.5, 600) as object) }}
      />
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={c.muted}
        style={{ height: 42, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 12, color: c.ink, backgroundColor: c.bg2, ...(type(13.5, 600) as object) }}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn label="Mark paid" icon="check" loading={busy} onPress={() => resolve('paid')} height={40} />
        <Btn label="Mark failed" variant="ghost" loading={busy} onPress={() => resolve('failed')} height={40} />
      </View>
    </View>
  );
}

export default function AdminPayouts() {
  const c = useC();
  const router = useRouter();
  const [filter, setFilter] = useState<admin.AdminPayoutStatus | undefined>('needs_review');
  const [nonce, setNonce] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, loading, error } = useAdminPayouts(filter, nonce);
  const refetch = () => setNonce((n) => n + 1);

  return (
    <Screen max={900}>
      <AdminHeader title="Payouts" sub={loading ? 'Loading…' : `${data?.length ?? 0} payout${data?.length === 1 ? '' : 's'}`} back={() => router.push('/admin')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {FILTERS.map((f) => {
          const on = f.value === filter;
          return (
            <Press key={f.label} scale={0.96} onPress={() => setFilter(f.value)}>
              <View style={{ paddingHorizontal: 13, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border }}>
                <Text style={[type(12.5, 800), { color: on ? '#fff' : c.ink }]}>{f.label}</Text>
              </View>
            </Press>
          );
        })}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        {loading ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>Loading…</Text></Block>
        ) : error ? (
          <ErrorRetry message={error.message} onRetry={refetch} />
        ) : !data || data.length === 0 ? (
          <Empty icon="bank" title="No payouts here" body="Nothing matches this filter right now." />
        ) : (
          data.map((p) => {
            const open = openId === p.id;
            return (
              <Block key={p.id}>
                <Press scale={0.995} onPress={() => setOpenId(open ? null : p.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{money(p.amount_cents / 100)}</Text>
                      <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>
                        {p.kitchen_name ?? 'Unknown kitchen'} · {p.source === 'auto' ? 'Automatic' : 'Manual'}
                      </Text>
                      <Text style={[type(12, 600), { color: c.muted, marginTop: 4 }]}>
                        {when(p.created_at)}{p.failure_reason ? ` · ${p.failure_reason}` : ''}{p.reconcile_attempts > 0 ? ` · ${p.reconcile_attempts} attempts` : ''}
                      </Text>
                    </View>
                    <StatusPill status={p.status} />
                    <Icon name={open ? 'chevDown' : 'chevRight'} size={18} color={c.muted} />
                  </View>
                </Press>
                {open && p.status === 'needs_review' ? <ResolveRow payout={p} onChanged={() => { setOpenId(null); refetch(); }} /> : null}
              </Block>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
