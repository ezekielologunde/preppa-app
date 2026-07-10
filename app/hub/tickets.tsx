import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Screen, TopBar, Block, Empty, Btn, MiniTag, Press, Icon } from '../../src/ui';
import { useStore } from '../../src/store/store';
import { currentUser } from '../../src/lib/supabase';
import * as tickets from '../../src/lib/tickets';

function when(iso: string): string { try { return new Date(iso).toLocaleString(); } catch { return ''; } }

function Thread({ ticketId, myUid, onReplied }: { ticketId: string; myUid: string | null; onReplied: () => void }) {
  const c = useC();
  const { toast } = useStore();
  const [msgs, setMsgs] = useState<tickets.ThreadMessage[] | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => { try { setMsgs(await tickets.ticketThread(ticketId)); } catch { setMsgs([]); } };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ticketId]);

  const send = async () => {
    if (reply.trim().length < 1) return;
    setBusy(true);
    try { await tickets.replyToSharedTicket(ticketId, reply.trim()); setReply(''); await load(); onReplied(); }
    catch (e: any) { toast(e?.message ?? 'Could not send', 'info'); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: c.border2, paddingTop: 12, gap: 10 }}>
      {msgs === null ? (
        <Text style={[type(13, 600), { color: c.soft }]}>Loading…</Text>
      ) : (
        msgs.map((m) => {
          const mine = !!myUid && m.author_id === myUid;
          return (
            <View key={m.id} style={{ backgroundColor: c.bg2, borderRadius: radius.md, padding: 11, alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
              <Text style={[type(11, 800), { color: c.soft, marginBottom: 3 }]}>{mine ? 'You' : 'Support'} · {when(m.created_at)}</Text>
              <Text style={[type(13.5, 600), { color: c.ink, lineHeight: 20 }]}>{m.body}</Text>
            </View>
          );
        })
      )}
      <TextInput
        value={reply}
        onChangeText={setReply}
        placeholder="Reply to support…"
        placeholderTextColor={c.muted}
        multiline
        style={{ minHeight: 52, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 12, color: c.ink, backgroundColor: c.surface, textAlignVertical: 'top', ...(type(14, 600) as object) }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Btn label="Send" icon="arrow" loading={busy} onPress={send} height={44} />
      </View>
    </View>
  );
}

export default function HubTickets() {
  const c = useC();
  const router = useRouter();
  const [items, setItems] = useState<tickets.SharedTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const u = await currentUser();
        if (alive) setMyUid(u?.id ?? null);
        const data = await tickets.listSharedTickets();
        if (alive) setItems(data);
      } catch (e: any) {
        if (alive) setError(e?.message ?? 'Could not load');
      }
    })();
    return () => { alive = false; };
  }, [nonce]);

  return (
    <Screen>
      <TopBar title="Support" sub="Issues about your orders" onBack={() => router.push('/my-hub')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {error ? (
          <Block title="Error"><Text style={[type(13.5, 600), { color: c.red }]}>{error}</Text></Block>
        ) : items === null ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>Loading…</Text></Block>
        ) : items.length === 0 ? (
          <Empty icon="info" title="Nothing to review" body="When an admin shares a customer issue about one of your orders, it'll appear here." />
        ) : (
          items.map((t) => {
            const open = openId === t.id;
            return (
              <Block key={t.id}>
                <Press scale={0.995} onPress={() => setOpenId(open ? null : t.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{t.subject}</Text>
                      <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{t.category.replace(/_/g, ' ')} · {when(t.created_at)}</Text>
                    </View>
                    <MiniTag label={t.status.replace(/_/g, ' ')} tone={t.status === 'resolved' || t.status === 'closed' ? 'green' : 'purple'} />
                    <Icon name={open ? 'chevDown' : 'chevRight'} size={18} color={c.muted} />
                  </View>
                </Press>
                {open ? (
                  <>
                    <Text style={[type(14, 600), { color: c.ink, lineHeight: 21, marginTop: 10 }]}>{t.body}</Text>
                    <Thread ticketId={t.id} myUid={myUid} onReplied={() => setNonce((n) => n + 1)} />
                  </>
                ) : null}
              </Block>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
