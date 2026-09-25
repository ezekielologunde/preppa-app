import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { Screen, TopBar, Block, Empty, MiniTag, Btn, Press, Icon } from '../src/ui';
import { supabase } from '../src/lib/supabase';
import { ticketThread, replyToTicket, type ThreadMessage } from '../src/lib/tickets';
import { useStore } from '../src/store/store';

interface MyTicket { id: string; subject: string; body: string; status: string; category: string; created_at: string }

function TicketThread({ ticket, onReplied }: { ticket: MyTicket; onReplied: () => void }) {
  const c = useC();
  const { toast } = useStore();
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);

  const load = async () => {
    setMessages(null);
    setError('');
    try {
      const [{ data }, rows] = await Promise.all([supabase.auth.getSession(), ticketThread(ticket.id)]);
      setMyUid(data.session?.user?.id ?? null);
      setMessages(rows);
    } catch (e: any) { setError(e?.message || 'Could not load this conversation.'); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ticket.id]);

  const send = async () => {
    const body = reply.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await replyToTicket(ticket.id, body);
      setReply('');
      await load();
      onReplied();
      toast(ticket.status === 'resolved' ? 'Reply sent and request reopened' : 'Reply sent', 'check', true);
    } catch (e: any) { toast(e?.message || 'Could not send your reply.', 'info'); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: c.border2, paddingTop: 12, gap: 10 }}>
      <Text style={[type(13.5, 600), { color: c.ink, lineHeight: 20 }]}>{ticket.body}</Text>
      {error ? (
        <View accessibilityRole="alert"><Text style={[type(12.5, 700), { color: c.red, marginBottom: 8 }]}>{error}</Text><View style={{ alignSelf: 'flex-start' }}><Btn label="Try again" icon="repeat" variant="ghost" onPress={load} /></View></View>
      ) : messages === null ? (
        <Text style={[type(13, 600), { color: c.soft }]}>Loading conversation…</Text>
      ) : messages.map((message) => {
        const mine = message.author_id === myUid;
        return <View key={message.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '90%', backgroundColor: c.bg2, borderRadius: radius.md, padding: 11 }}><Text style={[type(11, 800), { color: c.soft, marginBottom: 3 }]}>{mine ? 'You' : 'Support'}</Text><Text style={[type(13.5, 600), { color: c.ink, lineHeight: 20 }]}>{message.body}</Text></View>;
      })}
      {!error && ticket.status !== 'closed' ? <><TextInput value={reply} onChangeText={setReply} maxLength={2000} placeholder="Reply to support…" placeholderTextColor={c.muted} multiline accessibilityLabel="Reply to support, 2,000 characters maximum" style={{ minHeight: 56, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 12, color: c.ink, backgroundColor: c.bg2, textAlignVertical: 'top', ...(type(14, 600) as object) }} /><Text style={[type(11.5, 600), { color: c.muted, textAlign: 'right' }]}>{reply.length}/2000</Text><View style={{ alignItems: 'flex-end' }}><Btn label="Send reply" icon="arrow" loading={busy} disabled={!reply.trim()} onPress={send} height={44} /></View></> : null}
      {ticket.status === 'closed' ? <Text style={[type(12.5, 700), { color: c.soft }]}>This request is closed. Report a new issue from the related order if you still need help.</Text> : null}
    </View>
  );
}

/**
 * The signed-in user's own support tickets. Reads directly via the `tickets_select_own`
 * RLS policy (reporter_id = auth.uid()), so no admin RPC is involved — a user only ever
 * sees their own rows.
 */
export default function MyTickets() {
  const c = useC();
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setTickets(null);
    setError(null);
    (async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id,subject,body,status,category,created_at')
        .order('created_at', { ascending: false });
      if (!alive) return;
      if (error) setError(error.message);
      else setTickets((data as MyTicket[]) ?? []);
    })();
    return () => { alive = false; };
  }, [nonce]);

  return (
    <Screen>
      <TopBar title="Your support requests" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {error ? (
          <Block title="Couldn’t load support requests">
            <Text style={[type(13.5, 600), { color: c.red, marginBottom: 12 }]}>{error}</Text>
            <View style={{ alignSelf: 'flex-start' }}><Btn label="Try again" icon="repeat" variant="ghost" onPress={() => setNonce((n) => n + 1)} /></View>
          </Block>
        ) : tickets === null ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>Loading…</Text></Block>
        ) : tickets.length === 0 ? (
          <Empty icon="info" title="No requests yet" body="Issues you report on an order will show up here with their status." />
        ) : (
          tickets.map((t) => {
            const open = openId === t.id;
            return (
            <Block key={t.id}>
              <Press scale={0.995} onPress={() => setOpenId(open ? null : t.id)} label={`${open ? 'Close' : 'Open'} support request ${t.subject}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{t.subject}</Text>
                  <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>
                    {t.category.replace(/_/g, ' ')} · {(() => { try { return new Date(t.created_at).toLocaleDateString(); } catch { return ''; } })()}
                  </Text>
                </View>
                <MiniTag label={t.status.replace(/_/g, ' ')} tone={t.status === 'resolved' || t.status === 'closed' ? 'green' : 'purple'} />
                <Icon name={open ? 'chevDown' : 'chevRight'} size={18} color={c.muted} />
              </View>
              </Press>
              {open ? <TicketThread ticket={t} onReplied={() => setNonce((n) => n + 1)} /> : null}
            </Block>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
