import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Screen, Block, Empty, Btn, MiniTag, Press, Icon } from '../../src/ui';
import { useStore } from '../../src/store/store';
import { createCookDocSignedUrl } from '../../src/lib/supabase';
import { ImageViewer } from '../../src/components/ImageViewer';
import * as admin from '../../src/lib/admin';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { confirmAction } from '../../src/lib/confirm';

function when(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
}

export default function AdminInHomeVetting() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [data, setData] = useState<admin.AdminInHomeVetting[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null);
  const reviewInFlight = useRef(false);
  const loadRequest = useRef(0);
  const [viewUri, setViewUri] = useState<string | null>(null);

  const load = () => {
    const request = ++loadRequest.current;
    setLoading(true); setError(null);
    admin.listInHomeVetting()
      .then((r) => { if (request === loadRequest.current) setData(r); })
      .catch(() => { if (request === loadRequest.current) setError(new Error('Check your connection and try loading in-home reviews again.')); })
      .finally(() => { if (request === loadRequest.current) setLoading(false); });
  };
  useEffect(() => {
    load();
    return () => { loadRequest.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => { setOpenId(null); setReason(''); setBusy(null); };

  const approve = async (kitchenId: string, name: string) => {
    if (reviewInFlight.current) return;
    reviewInFlight.current = true;
    setBusy('approve');
    try {
      await admin.approveInHomeVetting(kitchenId);
      toast(`Approved ${name} for in-home cooking`, 'check', true);
      close(); load();
    } catch (e: any) {
      toast('Could not approve this in-home review. Refresh it and try again.', 'info');
      setBusy(null);
    } finally { reviewInFlight.current = false; }
  };
  const reject = async (kitchenId: string, name: string) => {
    if (reviewInFlight.current) return;
    if (reason.trim().length < 3) { toast('Add a short reason to reject', 'info'); return; }
    reviewInFlight.current = true;
    setBusy('reject');
    try {
      await admin.rejectInHomeVetting(kitchenId, reason.trim());
      toast(`Rejected ${name}`, 'x');
      close(); load();
    } catch (e: any) {
      toast('Could not reject this in-home review. Refresh it and try again.', 'info');
      setBusy(null);
    } finally { reviewInFlight.current = false; }
  };

  const requestApprove = (kitchenId: string, name: string) => {
    if (reviewInFlight.current) return;
    confirmAction(
      `Approve ${name} for in-home cooking?`,
      'Approval allows this kitchen to accept in-home cooking work. Confirm the background-check and insurance documents are current and valid.',
      () => void approve(kitchenId, name),
      'Approve in-home cooking',
    );
  };

  const requestReject = (kitchenId: string, name: string) => {
    if (reviewInFlight.current) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) { toast('Add a short reason to reject', 'info'); return; }
    confirmAction(
      `Reject ${name} for in-home cooking?`,
      `This keeps the kitchen from accepting in-home work. Rejection reason: ${trimmed}`,
      () => void reject(kitchenId, name),
      'Reject application',
    );
  };

  return (
    <Screen max={900}>
      <AdminHeader title="In-home safety" sub={loading ? 'Loading…' : `${data?.length ?? 0} pending`} back={() => router.push('/admin')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {loading ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>Loading…</Text></Block>
        ) : error ? (
          <ErrorRetry message={error.message} onRetry={load} />
        ) : !data || data.length === 0 ? (
          <Empty icon="shield" title="Queue is clear" body="No in-home vetting submissions are waiting for review." />
        ) : (
          data.map((v) => {
            const open = openId === v.kitchen_id;
            const bgDocs = v.docs?.backgroundCheck ?? [];
            const insDocs = v.docs?.insurance ?? [];
            const insuranceCurrent = !!v.insurance_expires_at && v.insurance_expires_at >= new Date().toISOString().slice(0, 10);
            const approvalReady = bgDocs.length > 0 && insDocs.length > 0 && insuranceCurrent;
            return (
              <Block key={v.kitchen_id}>
                <Press scale={0.995} onPress={() => { setOpenId(open ? null : v.kitchen_id); setReason(''); }} label={`${open ? 'Hide' : 'Show'} in-home review: ${v.kitchen_name}`} expanded={open}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{v.kitchen_name}</Text>
                      <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>
                        {v.applicant_name ?? 'Applicant'} · submitted {when(v.submitted_at)}
                      </Text>
                      {v.insurance_expires_at ? (
                        <Text style={[type(12, 600), { color: c.muted, marginTop: 2 }]}>Insurance expires {v.insurance_expires_at}</Text>
                      ) : null}
                    </View>
                    <MiniTag label="Pending" />
                    <Icon name={open ? 'chevDown' : 'chevRight'} size={18} color={c.muted} />
                  </View>
                </Press>

                {open ? (
                  <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: c.border2, paddingTop: 14, gap: 12 }}>
                    <View style={{ gap: 12 }}>
                      <PhotoStrip label="Background check" paths={bgDocs} onOpen={setViewUri} />
                      <PhotoStrip label="Insurance" paths={insDocs} onOpen={setViewUri} />
                    </View>
                    {!approvalReady ? (
                      <View accessibilityRole="alert" style={{ backgroundColor: c.redL, borderWidth: 1, borderColor: c.red, borderRadius: radius.md, padding: 12 }}>
                        <Text style={[type(12.5, 800), { color: c.red }]}>Approval requirements are incomplete</Text>
                        <Text style={[type(12, 600), { color: c.red, marginTop: 4, lineHeight: 18 }]}>A background-check document, insurance document, and current insurance expiration date are required.</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn
                        label="Approve" icon="check" flex={1}
                        loading={busy === 'approve'} disabled={busy !== null || !approvalReady}
                        onPress={() => requestApprove(v.kitchen_id, v.kitchen_name)}
                      />
                    </View>
                    <View>
                      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>
                        Reason (required to reject)
                      </Text>
                      <TextInput
                        value={reason} onChangeText={setReason}
                        placeholder="e.g. Background-check report is expired"
                        placeholderTextColor={c.muted} multiline
                        maxLength={1000}
                        accessibilityLabel="Reason required to reject, 1,000 characters maximum"
                        style={{
                          minHeight: 64, borderWidth: 1, borderColor: c.border, borderRadius: radius.md,
                          padding: 12, color: c.ink, backgroundColor: c.bg2, textAlignVertical: 'top',
                          ...(type(14, 600) as object),
                        }}
                      />
                      <Text style={[type(11.5, 600), { color: c.muted, textAlign: 'right', marginTop: 4 }]}>{reason.length}/1000</Text>
                      <View style={{ marginTop: 10 }}>
                        <Btn
                          label="Reject" variant="ghost" icon="x"
                          loading={busy === 'reject'} disabled={busy !== null}
                          onPress={() => requestReject(v.kitchen_id, v.kitchen_name)}
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
      <ImageViewer uri={viewUri ?? undefined} visible={!!viewUri} onClose={() => setViewUri(null)} />
    </Screen>
  );
}

/** Horizontal strip of private docs (paths → signed URLs). */
function PhotoStrip({ label, paths, onOpen }: { label: string; paths: string[]; onOpen: (uri: string) => void }) {
  const c = useC();
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!paths.length) { setUrls([]); setLoading(false); return; }
    setLoading(true); setLoadError('');
    Promise.allSettled(paths.map((p) => createCookDocSignedUrl(p))).then((r) => {
      if (!alive) return;
      const next = r.flatMap((item) => item.status === 'fulfilled' && item.value ? [item.value] : []);
      setUrls(next);
      if (next.length < paths.length) setLoadError(next.length ? 'Some documents could not be opened.' : 'Documents could not be opened.');
      setLoading(false);
    });
    return () => { alive = false; };
  }, [paths.join(','), nonce]);
  if (!paths.length) return <Text style={[type(12.5, 600), { color: c.muted }]}>{label}: none submitted</Text>;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4 }]}>{label} ({paths.length})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {loading ? <Text style={[type(12, 600), { color: c.soft }]}>Loading…</Text> : urls.map((u, i) => (
          <Press key={i} scale={0.95} onPress={() => onOpen(u)} label={`View ${label} document`}>
            <Image source={{ uri: u }} style={{ width: 74, height: 74, borderRadius: radius.md, backgroundColor: c.surface }} resizeMode="cover" />
          </Press>
        ))}
      </ScrollView>
      {loadError ? <View accessibilityRole="alert" style={{ alignItems: 'flex-start', gap: 6 }}><Text style={[type(12, 700), { color: c.red }]}>{loadError}</Text><Btn label="Retry documents" icon="repeat" variant="ghost" height={40} onPress={() => setNonce((n) => n + 1)} /></View> : null}
    </View>
  );
}
