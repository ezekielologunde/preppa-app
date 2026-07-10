import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Screen, Block, Empty, Btn, MiniTag, Press, Icon } from '../../src/ui';
import { useStore } from '../../src/store/store';
import { useAdminTickets } from '../../src/data/hooks';
import * as admin from '../../src/lib/admin';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';

const STATUSES: admin.TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
const STATUS_LABEL: Record<admin.TicketStatus, string> = {
  open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed',
};
function when(iso: string): string { try { return new Date(iso).toLocaleString(); } catch { return ''; } }

function StatusPill({ status }: { status: admin.TicketStatus }) {
  return <MiniTag label={STATUS_LABEL[status]} tone={status === 'resolved' || status === 'closed' ? 'green' : 'purple'} />;
}

function Detail({ ticketId, onChanged }: { ticketId: string; onChanged: () => void }) {
  const c = useC();
  const { toast } = useStore();
  const [detail, setDetail] = useState<admin.AdminTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setDetail(await admin.ticketDetail(ticketId)); } catch { /* surfaced below */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ticketId]);

  const changeStatus = async (s: admin.TicketStatus) => {
    setBusy(true);
    try { await admin.setTicketStatus(ticketId, s); toast(`Marked ${STATUS_LABEL[s].toLowerCase()}`, 'check', true); await load(); onChanged(); }
    catch (e: any) { toast(e?.message ?? 'Update failed', 'info'); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (reply.trim().length < 1) return;
    setBusy(true);
    try { await admin.replyToTicket(ticketId, reply.trim(), internal); setReply(''); setInternal(false); await load(); onChanged(); }
    catch (e: any) { toast(e?.message ?? 'Reply failed', 'info'); }
    finally { setBusy(false); }
  };
  const shareCook = async () => {
    setBusy(true);
    try { await admin.shareTicketWithCook(ticketId); toast('Shared with the cook', 'check', true); await load(); onChanged(); }
    catch (e: any) { toast(e?.message ?? 'Share failed', 'info'); }
    finally { setBusy(false); }
  };

  if (loading) return <Text style={[type(13.5, 600), { color: c.soft, marginTop: 12 }]}>Loading…</Text>;
  if (!detail) return <Text style={[type(13.5, 600), { color: c.red, marginTop: 12 }]}>Couldn’t load this ticket.</Text>;

  return (
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: c.border2, paddingTop: 14, gap: 14 }}>
      <Text style={[type(14, 600), { color: c.ink, lineHeight: 21 }]}>{detail.body}</Text>

      <View>
        <Text style={[type(11, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }]}>Status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {STATUSES.map((s) => {
            const on = detail.status === s;
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

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {detail.cook_visible ? (
          <MiniTag label="Shared with cook" tone="green" />
        ) : (
          <Btn label="Share with cook" variant="ghost" icon="chefhat" loading={busy} onPress={shareCook} height={44} />
        )}
      </View>

      {detail.messages.length ? (
        <View style={{ gap: 8 }}>
          <Text style={[type(11, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4 }]}>Thread</Text>
          {detail.messages.map((m) => (
            <View key={m.id} style={{ backgroundColor: c.bg2, borderRadius: radius.md, padding: 11, borderWidth: m.is_internal ? 1.5 : 0, borderColor: c.primary }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={[type(11.5, 800), { color: c.soft }]}>{m.from_admin ? 'Admin' : 'User'}</Text>
                {m.is_internal ? <MiniTag label="Internal" tone="purple" /> : null}
                <Text style={[type(10.5, 600), { color: c.muted }]}>{when(m.created_at)}</Text>
              </View>
              <Text style={[type(13.5, 600), { color: c.ink, lineHeight: 20 }]}>{m.body}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View>
        <TextInput
          value={reply}
          onChangeText={setReply}
          placeholder="Write a reply…"
          placeholderTextColor={c.muted}
          multiline
          style={{ minHeight: 56, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 12, color: c.ink, backgroundColor: c.bg2, textAlignVertical: 'top', ...(type(14, 600) as object) }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <Press scale={0.96} onPress={() => setInternal((v) => !v)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: internal ? c.primary : c.border, backgroundColor: internal ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {internal ? <Icon name="check" size={13} color="#fff" /> : null}
              </View>
              <Text style={[type(13, 700), { color: c.soft }]}>Internal note</Text>
            </View>
          </Press>
          <View style={{ flex: 1 }} />
          <Btn label="Send" icon="arrow" loading={busy} onPress={send} height={44} />
        </View>
      </View>
    </View>
  );
}

export default function AdminTickets() {
  const c = useC();
  const router = useRouter();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useAdminTickets(nonce);
  const [openId, setOpenId] = useState<string | null>(null);
  const refetch = () => setNonce((n) => n + 1);

  return (
    <Screen max={900}>
      <AdminHeader title="Support tickets" sub={loading ? 'Loading…' : `${data?.length ?? 0} tickets`} back={() => router.push('/admin')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        {loading ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>Loading…</Text></Block>
        ) : error ? (
          <ErrorRetry message={error.message} onRetry={refetch} />
        ) : !data || data.length === 0 ? (
          <Empty icon="bell" title="No tickets" body="Order issues reported by customers or preppers will show up here." />
        ) : (
          data.map((t) => {
            const open = openId === t.ticket_id;
            return (
              <Block key={t.ticket_id}>
                <Press scale={0.995} onPress={() => setOpenId(open ? null : t.ticket_id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{t.subject}</Text>
                      <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>
                        {t.category.replace(/_/g, ' ')}{t.kitchen_name ? ` · ${t.kitchen_name}` : ''}
                      </Text>
                      <Text style={[type(12, 600), { color: c.muted, marginTop: 4 }]}>
                        {t.reporter_name ?? 'Reporter'} · {when(t.created_at)}
                      </Text>
                    </View>
                    <StatusPill status={t.status} />
                    <Icon name={open ? 'chevDown' : 'chevRight'} size={18} color={c.muted} />
                  </View>
                </Press>
                {open ? <Detail ticketId={t.ticket_id} onChanged={refetch} /> : null}
              </Block>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
