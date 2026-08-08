import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Image, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Screen, Block, Empty, Btn, MiniTag, StatusTag, Press, Icon } from '../../src/ui';
import { useStore } from '../../src/store/store';
import { useAdminApplications } from '../../src/data/hooks';
import { supabase, createCookDocSignedUrl } from '../../src/lib/supabase';
import { ImageViewer } from '../../src/components/ImageViewer';
import * as admin from '../../src/lib/admin';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';

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
      <AdminHeader title="Applications" sub={loading ? 'Loading…' : `${data?.length ?? 0} pending`} back={() => router.push('/admin')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {loading ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>Loading…</Text></Block>
        ) : error ? (
          <ErrorRetry message={error.message} onRetry={refetch} />
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
  const [viewUri, setViewUri] = useState<string | null>(null);
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
  const docs = fs.docs || {};
  const hasPhotos = !!(docs.fridge?.length || docs.kitchen?.length);
  const yn = (b?: boolean) => (b ? '✓' : '—');
  const svc = (d.service_types || []).map((t) => (t === 'home_chef' ? 'Cook at homes' : 'Homemade meals')).join(' · ') || '—';
  return (
    <>
      <View style={{ gap: 8, backgroundColor: c.bg2, borderRadius: radius.md, padding: 12 }}>
        <DRow c={c} k="Service" v={svc} />
        <DRow c={c} k="Applicant" v={d.applicant_name || '—'} />
        <DRow c={c} k="Phone" v={d.phone || '—'} />
        <DRow c={c} k="Address (private)" v={d.address || '—'} />
        <AddressVerificationRow c={c} lat={d.verified_lat} lng={d.verified_lng} />
        <DRow c={c} k="Neighborhood" v={d.approx_area || '—'} />
        {d.service_area ? <DRow c={c} k="Travels" v={d.service_area} /> : null}
        {d.experience ? <DRow c={c} k="Experience" v={d.experience} /> : null}
        <DRow c={c} k="Cuisine" v={d.cuisine || '—'} />
        {d.bio ? <DRow c={c} k="About" v={d.bio} /> : null}
        <DRow c={c} k="Food safety" v={`Refrigeration ${yn(fs.refrigeration)} · Prep ${yn(fs.foodPrep)} · Allergens ${yn(fs.allergens)}`} />
        <DRow c={c} k="Food-handler cert" v={d.food_handler_cert || '—'} />
        <DRow c={c} k="Agreement" v={d.agreement_version ? `${d.agreement_version} · accepted` : 'not accepted'} />
        <ConnectStatusRow c={c} kitchenId={d.kitchen_id} />
        {hasPhotos ? (
          <View style={{ gap: 12, marginTop: 6, borderTopWidth: 1, borderTopColor: c.border2, paddingTop: 12 }}>
            <PhotoStrip label="Refrigeration" paths={docs.fridge} onOpen={setViewUri} />
            <PhotoStrip label="Kitchen / stove" paths={docs.kitchen} onOpen={setViewUri} />
          </View>
        ) : null}
      </View>
      <ImageViewer uri={viewUri ?? undefined} visible={!!viewUri} onClose={() => setViewUri(null)} />
    </>
  );
}

/** Horizontal strip of a cook's verification photos (private → signed URLs). */
function PhotoStrip({ label, paths, onOpen }: { label: string; paths?: string[]; onOpen: (uri: string) => void }) {
  const c = useC();
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    if (!paths?.length) { setUrls([]); return; }
    Promise.all(paths.map((p) => createCookDocSignedUrl(p))).then((r) => { if (alive) setUrls(r.filter(Boolean) as string[]); });
    return () => { alive = false; };
  }, [paths?.join(',')]);
  if (!paths?.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4 }]}>{label} ({paths.length})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {urls.length === 0 ? <Text style={[type(12, 600), { color: c.soft }]}>Loading…</Text> : urls.map((u, i) => (
          <Press key={i} scale={0.95} onPress={() => onOpen(u)} label={`View ${label} photo`}>
            <Image source={{ uri: u }} style={{ width: 74, height: 74, borderRadius: radius.md, backgroundColor: c.surface }} resizeMode="cover" />
          </Press>
        ))}
      </ScrollView>
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

/** Whether the applicant's typed address resolved to a real place (geocoded client-side at
 *  submission, via free OpenStreetMap Nominatim — see submitPrepperApplication). A failed
 *  geocode doesn't block the application; it just shows "not verified" here so admin can
 *  judge for themselves or ask the applicant to correct it. */
function AddressVerificationRow({ c, lat, lng }: { c: any; lat: number | null; lng: number | null }) {
  const verified = lat != null && lng != null;
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Text style={[type(12, 700), { color: c.muted, width: 130 }]}>Address check</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <StatusTag label={verified ? 'Resolved to a real place' : 'Not verified — check manually'} tone={verified ? 'success' : 'info'} />
        {verified ? (
          <Press onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`)} label="View on map">
            <Text style={[type(12, 800), { color: c.accentText }]}>View on map ↗</Text>
          </Press>
        ) : null}
      </View>
    </View>
  );
}

/** Cook's Stripe Connect (identity + payout) status — the KYC replaces raw Gov-ID photos. */
function ConnectStatusRow({ c, kitchenId }: { c: any; kitchenId: string }) {
  const [label, setLabel] = useState('Checking…');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from('stripe_accounts').select('details_submitted, charges_enabled, payouts_enabled').eq('kitchen_id', kitchenId).maybeSingle();
        if (!alive) return;
        if (!data) setLabel('Not started');
        else if (data.charges_enabled && data.payouts_enabled) setLabel('Verified via Stripe · payouts enabled ✓');
        else if (data.details_submitted) setLabel('Submitted · Stripe reviewing');
        else setLabel('Onboarding started (incomplete)');
      } catch { if (alive) setLabel('—'); }
    })();
    return () => { alive = false; };
  }, [kitchenId]);
  return <DRow c={c} k="Identity / payouts" v={label} />;
}
