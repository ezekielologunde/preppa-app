import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Screen, TopBar, Block, Empty, Btn, MiniTag, Press, Icon } from '../../src/ui';
import { useStore } from '../../src/store/store';
import { useAdminApplications } from '../../src/data/hooks';
import * as admin from '../../src/lib/admin';

function when(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
}

export default function AdminApplications() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useAdminApplications(nonce);

  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null);

  const refetch = () => setNonce((n) => n + 1);
  const close = () => { setOpenId(null); setReason(''); setBusy(null); };

  const approve = async (id: string, name: string) => {
    setBusy('approve');
    try {
      await admin.approveApplication(id);
      toast(`Approved ${name}`, 'check', true);
      close();
      refetch();
    } catch (e: any) {
      toast(e?.message ?? 'Approve failed', 'info');
      setBusy(null);
    }
  };

  const reject = async (id: string, name: string) => {
    if (reason.trim().length < 3) { toast('Add a short reason to reject', 'info'); return; }
    setBusy('reject');
    try {
      await admin.rejectApplication(id, reason.trim());
      toast(`Rejected ${name}`, 'x');
      close();
      refetch();
    } catch (e: any) {
      toast(e?.message ?? 'Reject failed', 'info');
      setBusy(null);
    }
  };

  return (
    <Screen max={900}>
      <TopBar title="Applications" onBack={() => router.push('/admin')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {loading ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>Loading…</Text></Block>
        ) : error ? (
          <Block title="Error"><Text style={[type(13.5, 600), { color: c.red }]}>{error.message}</Text></Block>
        ) : !data || data.length === 0 ? (
          <Empty icon="chefhat" title="Queue is clear" body="No prepper applications are waiting for review." />
        ) : (
          data.map((app) => {
            const open = openId === app.kitchen_id;
            return (
              <Block key={app.kitchen_id}>
                <Press scale={0.995} onPress={() => { setOpenId(open ? null : app.kitchen_id); setReason(''); }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{app.kitchen_name}</Text>
                      <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>
                        {[app.cuisine, app.approx_area].filter(Boolean).join(' · ') || 'No details'}
                      </Text>
                      <Text style={[type(12, 600), { color: c.muted, marginTop: 4 }]}>
                        {app.applicant_name ?? 'Applicant'} · applied {when(app.applied_at)}
                      </Text>
                    </View>
                    <MiniTag label="Pending" />
                    <Icon name={open ? 'chevDown' : 'chevRight'} size={18} color={c.muted} />
                  </View>
                </Press>

                {open ? (
                  <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: c.border2, paddingTop: 14, gap: 12 }}>
                    <AppDetail kitchenId={app.kitchen_id} />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn
                        label="Approve"
                        icon="check"
                        flex={1}
                        loading={busy === 'approve'}
                        disabled={busy !== null}
                        onPress={() => approve(app.kitchen_id, app.kitchen_name)}
                      />
                    </View>
                    <View>
                      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>
                        Reason (required to reject)
                      </Text>
                      <TextInput
                        value={reason}
                        onChangeText={setReason}
                        placeholder="e.g. Kitchen photos don't meet food-safety guidelines"
                        placeholderTextColor={c.muted}
                        multiline
                        style={{
                          minHeight: 64,
                          borderWidth: 1,
                          borderColor: c.border,
                          borderRadius: radius.md,
                          padding: 12,
                          color: c.ink,
                          backgroundColor: c.bg2,
                          textAlignVertical: 'top',
                          ...(type(14, 600) as object),
                        }}
                      />
                      <View style={{ marginTop: 10 }}>
                        <Btn
                          label="Reject application"
                          variant="ghost"
                          icon="x"
                          loading={busy === 'reject'}
                          disabled={busy !== null}
                          onPress={() => reject(app.kitchen_id, app.kitchen_name)}
                        />
                      </View>
                    </View>
                  </View>
                ) : null}
              </Block>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

/** Lazy-loads and shows the private application detail for review. */
function AppDetail({ kitchenId }: { kitchenId: string }) {
  const c = useC();
  const [d, setD] = useState<admin.AdminApplicationDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [err, setErr] = useState('');
  useEffect(() => {
    let cancelled = false;
    admin
      .applicationDetail(kitchenId)
      .then((r) => { if (!cancelled) { setD(r); setState('ok'); } })
      .catch((e) => { if (!cancelled) { setErr(e?.message || 'Failed to load'); setState('error'); } });
    return () => { cancelled = true; };
  }, [kitchenId]);
  if (state === 'loading') return <Text style={[type(13, 600), { color: c.soft }]}>Loading details…</Text>;
  if (state === 'error' || !d) return <Text style={[type(13, 600), { color: c.red }]}>{err || 'No detail'}</Text>;
  const fs = d.food_safety || {};
  const yn = (b?: boolean) => (b ? '✓' : '—');
  return (
    <View style={{ gap: 8, backgroundColor: c.bg2, borderRadius: radius.md, padding: 12 }}>
      <DRow c={c} k="Applicant" v={d.applicant_name || '—'} />
      <DRow c={c} k="Phone" v={d.phone || '—'} />
      <DRow c={c} k="Address (private)" v={d.address || '—'} />
      <DRow c={c} k="Neighborhood" v={d.approx_area || '—'} />
      <DRow c={c} k="Cuisine" v={d.cuisine || '—'} />
      {d.bio ? <DRow c={c} k="About" v={d.bio} /> : null}
      <DRow c={c} k="Food safety" v={`Refrigeration ${yn(fs.refrigeration)} · Prep ${yn(fs.foodPrep)} · Allergens ${yn(fs.allergens)}`} />
      <DRow c={c} k="Food-handler cert" v={d.food_handler_cert || '—'} />
      <DRow c={c} k="Agreement" v={d.agreement_version ? `${d.agreement_version} · accepted` : 'not accepted'} />
    </View>
  );
}
function DRow({ c, k, v }: { c: any; k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Text style={[type(12, 700), { color: c.muted, width: 130 }]}>{k}</Text>
      <Text style={[type(12.5, 700), { color: c.ink, flex: 1 }]}>{v}</Text>
    </View>
  );
}
