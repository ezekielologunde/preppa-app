import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Screen, Block, Empty, Btn, MiniTag, StatusTag, Press, Icon } from '../../src/ui';
import { useStore } from '../../src/store/store';
import { useAdminSupportRequests } from '../../src/data/hooks';
import * as admin from '../../src/lib/admin';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';

const STATUSES: admin.SupportRequestStatus[] = ['submitted', 'acknowledged', 'investigating', 'resolved', 'closed'];
const STATUS_LABEL: Record<admin.SupportRequestStatus, string> = {
  submitted: 'Submitted', acknowledged: 'Acknowledged', investigating: 'Investigating', resolved: 'Resolved', closed: 'Closed',
};
const TYPE_LABEL: Record<admin.SupportRequestType, string> = { support: 'Support', safety: 'Safety', abuse: 'Abuse' };

function when(iso: string): string { try { return new Date(iso).toLocaleString(); } catch { return ''; } }

function TypeTag({ type: t, urgent }: { type: admin.SupportRequestType; urgent: boolean }) {
  if (urgent) return <StatusTag label="Urgent" tone="danger" />;
  return <MiniTag label={TYPE_LABEL[t]} tone={t === 'safety' || t === 'abuse' ? 'purple' : 'green'} />;
}

function Row({ r, open, onToggle, onChanged }: { r: admin.AdminSupportRequest; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const c = useC();
  const { toast } = useStore();
  const [busy, setBusy] = useState(false);

  const changeStatus = async (s: admin.SupportRequestStatus) => {
    setBusy(true);
    try { await admin.setSupportRequestStatus(r.id, s); toast(`Marked ${STATUS_LABEL[s].toLowerCase()}`, 'check', true); onChanged(); }
    catch (e: any) { toast(e?.message ?? 'Update failed', 'info'); }
    finally { setBusy(false); }
  };

  return (
    <Block>
      <Press scale={0.995} onPress={onToggle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TypeTag type={r.report_type} urgent={r.immediate_risk} />
              {r.ref ? <Text style={[type(11, 700), { color: c.muted }]}>{r.ref}</Text> : null}
            </View>
            <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3, marginTop: 4 }]}>{r.subject || r.description.slice(0, 60)}</Text>
            <Text style={[type(12, 600), { color: c.muted, marginTop: 4 }]}>{r.email} · {when(r.created_at)}</Text>
          </View>
          <MiniTag label={STATUS_LABEL[r.status]} tone={r.status === 'resolved' || r.status === 'closed' ? 'green' : 'purple'} />
          <Icon name={open ? 'chevDown' : 'chevRight'} size={18} color={c.muted} />
        </View>
      </Press>
      {open ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: c.border2, paddingTop: 14, gap: 14 }}>
          <Text style={[type(14, 600), { color: c.ink, lineHeight: 21 }]}>{r.description}</Text>
          {r.category || r.role || r.related_ref ? (
            <Text style={[type(12.5, 600), { color: c.soft }]}>
              {[r.role, r.category, r.related_ref ? `re: ${r.related_ref}` : null].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          <View>
            <Text style={[type(11, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }]}>Status</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {STATUSES.map((s) => {
                const on = r.status === s;
                return (
                  <Press key={s} scale={0.96} disabled={busy || on} onPress={() => changeStatus(s)}>
                    <View style={{ paddingHorizontal: 13, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border }}>
                      <Text style={[type(12.5, 800), { color: on ? '#fff' : c.ink }]}>{STATUS_LABEL[s]}</Text>
                    </View>
                  </Press>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </Block>
  );
}

export default function AdminSupportRequests() {
  const c = useC();
  const router = useRouter();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useAdminSupportRequests(nonce);
  const [openId, setOpenId] = useState<string | null>(null);
  const refetch = () => setNonce((n) => n + 1);

  const urgentCount = data?.filter((r) => r.immediate_risk && r.status !== 'resolved' && r.status !== 'closed').length ?? 0;

  return (
    <Screen max={900}>
      <AdminHeader
        title="Safety & support requests"
        sub={loading ? 'Loading…' : `${data?.length ?? 0} requests${urgentCount ? ` · ${urgentCount} urgent` : ''}`}
        back={() => router.push('/admin')}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        {loading ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>Loading…</Text></Block>
        ) : error ? (
          <ErrorRetry message={error.message} onRetry={refetch} />
        ) : !data || data.length === 0 ? (
          <Empty icon="flag" title="No requests" body="Safety, abuse, and support submissions from the marketing site show up here." />
        ) : (
          data.map((r) => (
            <Row key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} onChanged={refetch} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
