import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useC } from '../src/theme/ThemeContext';
import { type } from '../src/theme/theme';
import { Screen, TopBar, Block, Empty, MiniTag } from '../src/ui';
import { supabase } from '../src/lib/supabase';

interface MyTicket { id: string; subject: string; status: string; category: string; created_at: string }

/**
 * The signed-in user's own support tickets. Reads directly via the `tickets_select_own`
 * RLS policy (reporter_id = auth.uid()), so no admin RPC is involved — a user only ever
 * sees their own rows.
 */
export default function MyTickets() {
  const c = useC();
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id,subject,status,category,created_at')
        .order('created_at', { ascending: false });
      if (!alive) return;
      if (error) setError(error.message);
      else setTickets((data as MyTicket[]) ?? []);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Screen>
      <TopBar title="Your support requests" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {error ? (
          <Block title="Error"><Text style={[type(13.5, 600), { color: c.red }]}>{error}</Text></Block>
        ) : tickets === null ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>Loading…</Text></Block>
        ) : tickets.length === 0 ? (
          <Empty icon="info" title="No requests yet" body="Issues you report on an order will show up here with their status." />
        ) : (
          tickets.map((t) => (
            <Block key={t.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{t.subject}</Text>
                  <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>
                    {t.category.replace(/_/g, ' ')} · {(() => { try { return new Date(t.created_at).toLocaleDateString(); } catch { return ''; } })()}
                  </Text>
                </View>
                <MiniTag label={t.status.replace(/_/g, ' ')} tone={t.status === 'resolved' || t.status === 'closed' ? 'green' : 'purple'} />
              </View>
            </Block>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
