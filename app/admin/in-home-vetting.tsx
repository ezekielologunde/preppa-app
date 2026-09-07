import React, { useEffect, useState } from 'react';
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
  const [viewUri, setViewUri] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setError(null);
    admin.listInHomeVetting().then((r) => { setData(r); setLoading(false); }).catch((e) => { setError(e); setLoading(false); });
  };
  useEffect(load, []);

  const close = () => { setOpenId(null); setReason(''); setBusy(null); };

  const approve = async (kitchenId: string, name: string) => {
    setBusy('approve');
    try {
      await admin.approveInHomeVetting(kitchenId);
      toast(`Approved ${name} for in-home cooking`, 'check', true);
      close(); load();
    } catch (e: any) {
      toast(e?.message ?? 'Approve failed', 'info');
      setBusy(null);
    }
  };
  const reject = async (kitchenId: string, name: string) => {
    if (reason.trim().length < 3) { toast('Add a short reason to reject', 'info'); return; }
    setBusy('reject');
    try {
      await admin.rejectInHomeVetting(kitchenId, reason.trim());
      toast(`Rejected ${name}`, 'x');
      close(); load();
    } catch (e: any) {
      toast(e?.message ?? 'Reject failed', 'info');
      setBusy(null);
    }
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
            return (
              <Block key={v.kitchen_id}>
                <Press scale={0.995} onPress={() => { setOpenId(open ? null : v.kitchen_id); setReason(''); }}>
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
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn
                        label="Approve" icon="check" flex={1}
                        loading={busy === 'approve'} disabled={busy !== null}
                        onPress={() => approve(v.kitchen_id, v.kitchen_name)}
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
                        style={{
                          minHeight: 64, borderWidth: 1, borderColor: c.border, borderRadius: radius.md,
                          padding: 12, color: c.ink, backgroundColor: c.bg2, textAlignVertical: 'top',
                          ...(type(14, 600) as object),
                        }}
                      />
                      <View style={{ marginTop: 10 }}>
                        <Btn
                          label="Reject" variant="ghost" icon="x"
                          loading={busy === 'reject'} disabled={busy !== null}
                          onPress={() => reject(v.kitchen_id, v.kitchen_name)}
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
  useEffect(() => {
    let alive = true;
    if (!paths.length) { setUrls([]); return; }
    Promise.all(paths.map((p) => createCookDocSignedUrl(p))).then((r) => { if (alive) setUrls(r.filter(Boolean) as string[]); });
    return () => { alive = false; };
  }, [paths.join(',')]);
  if (!paths.length) return <Text style={[type(12.5, 600), { color: c.muted }]}>{label}: none submitted</Text>;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4 }]}>{label} ({paths.length})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {urls.length === 0 ? <Text style={[type(12, 600), { color: c.soft }]}>Loading…</Text> : urls.map((u, i) => (
          <Press key={i} scale={0.95} onPress={() => onOpen(u)} label={`View ${label} document`}>
            <Image source={{ uri: u }} style={{ width: 74, height: 74, borderRadius: radius.md, backgroundColor: c.surface }} resizeMode="cover" />
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}
