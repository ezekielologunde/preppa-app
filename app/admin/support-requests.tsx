import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Screen, Block, Empty, Btn, MiniTag, StatusTag, Press, Icon } from '../../src/ui';
import { useStore } from '../../src/store/store';
import { useAdminSupportRequests } from '../../src/data/hooks';
import * as admin from '../../src/lib/admin';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { confirmAction } from '../../src/lib/confirm';

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
  const statusInFlight = useRef(false);

  const changeStatus = async (s: admin.SupportRequestStatus) => {
    if (statusInFlight.current) return;
    statusInFlight.current = true;
    setBusy(true);
    try { await admin.setSupportRequestStatus(r.id, s); toast(`Marked ${STATUS_LABEL[s].toLowerCase()}`, 'check', true); onChanged(); }
    catch (e: any) { toast(e?.message ?? 'Update failed', 'info'); }
    finally { statusInFlight.current = false; setBusy(false); }
  };
  const requestStatus = (s: admin.SupportRequestStatus) => {
    if (statusInFlight.current) return;
    if (s !== 'closed' && !(s === 'resolved' && r.immediate_risk)) {
      void changeStatus(s);
      return;
    }
    if (s === 'resolved') {
      confirmAction(
        'Resolve this urgent request?',
        'Resolving removes this request from the active urgent count. Confirm the immediate risk has been addressed and the response is documented.',
        () => void changeStatus(s),
        'Resolve request',
      );
      return;
    }
    confirmAction(
      'Close this request?',
      r.immediate_risk
        ? 'This request is marked urgent. Closing it removes it from the active urgent count. Confirm the immediate risk has been addressed and documented.'
        : 'Closing removes this request from the active support queue. Confirm the issue and any reporter follow-up are complete.',
      () => void changeStatus(s),
      'Close request',
    );
  };

  const emailReporter = async () => {
    const subject = `Preppa support${r.ref ? ` ${r.ref}` : ''}: ${r.subject || TYPE_LABEL[r.report_type]}`;
    const body = `Hi${r.name ? ` ${r.name}` : ''},\n\nWe are following up on your Preppa ${TYPE_LABEL[r.report_type].toLowerCase()} request${r.ref ? ` (${r.ref})` : ''}.\n\n`;
    const url = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      toast('Could not open an email app. Copy the reporter email shown above.', 'info');
    }
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
          <View style={{ alignItems: 'flex-start' }}>
            <Btn label="Email reporter" icon="mail" variant="ghost" onPress={emailReporter} />
          </View>
          <View>
            <Text style={[type(11, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }]}>Status</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {STATUSES.map((s) => {
                const on = r.status === s;
                return (
                  <Press key={s} scale={0.96} disabled={busy || on} onPress={() => requestStatus(s)} label={`${STATUS_LABEL[s]}${on ? ', current status' : ''}`} selected={on}>
                    <View style={{ paddingHorizontal: 13, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border }}>
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
