import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import type { AppNotification } from '../src/lib/supabase';
import { Icon, Press } from '../src/ui';
import { Screen, TopBar, Empty } from '../src/ui/layout';

type Tone = '' | 'amber' | 'purple' | 'blue' | 'pink' | 'green';

// Map a notification `kind` to an icon/tone and an in-app destination.
const KIND_META: Record<string, { ico: string; tone: Tone; route?: string }> = {
  kitchen: { ico: 'chefhat', tone: 'amber', route: '/my-hub' },
  order: { ico: 'cart', tone: 'green', route: '/orders' },
};
const metaFor = (kind: string) => KIND_META[kind] ?? { ico: 'bell', tone: '' as Tone, route: undefined };

function relTime(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function Notifications() {
  const c = useC();
  const router = useRouter();
  const { notifs, markNotifRead, markAllRead, notifCount, threadUnread } = useStore();
  const [tab, setTab] = useState<'alerts' | 'messages'>('alerts');
  const unreadAlerts = notifs.filter((n) => n.unread).length;

  const openAlert = (n: AppNotification) => {
    markNotifRead(n.id);
    const route = metaFor(n.kind).route;
    if (route) router.push(route as any);
  };

  return (
    <Screen>
      <TopBar title="Notifications" right={notifCount > 0 ? (
        <Press scale={0.95} onPress={markAllRead} label="Mark all read"><Text style={[type(13, 800), { color: c.primary }]}>Mark all read</Text></Press>
      ) : undefined} />
      <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border2, flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
        <Seg label="Alerts" count={unreadAlerts} on={tab === 'alerts'} onPress={() => setTab('alerts')} />
        <Seg label="Messages" count={threadUnread} on={false} onPress={() => router.push('/messages')} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {tab === 'alerts' ? (
          notifs.length === 0 ? (
            <Empty icon="bell" title="No alerts yet" body="Order updates and account activity show up here." />
          ) : (
            notifs.map((n) => {
              const meta = metaFor(n.kind);
              return (
                <Press key={n.id} scale={0.99} onPress={() => openAlert(n)} label={n.title}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 15, paddingHorizontal: 16, backgroundColor: n.unread ? c.unread : c.surface, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
                    <IconWell ico={meta.ico} tone={meta.tone} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type(14.5, 800), { color: c.ink }]}>{n.title}</Text>
                      {n.body ? <Text style={[type(13, 500), { color: c.soft, marginTop: 2, lineHeight: 18 }]}>{n.body}</Text> : null}
                    </View>
                    <Text style={[type(11, 700), { color: c.muted }]}>{relTime(n.created_at)}</Text>
                    {n.unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary, marginTop: 4 }} /> : null}
                  </View>
                </Press>
              );
            })
          )
        ) : (
          <Empty icon="chat" title="Messaging is coming soon" body="Direct chat with your cook will live here. For now, use “Report an issue” on an order to reach support." />
        )}
      </ScrollView>
    </Screen>
  );
}

function Seg({ label, count, on, onPress }: { label: string; count: number; on: boolean; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.97} onPress={onPress} style={{ flex: 1 }}>
      <View style={{ height: 40, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.bg2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <Text style={[type(14, 800), { color: on ? '#fff' : c.soft }]}>{label}</Text>
        {count > 0 ? (
          <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: on ? 'rgba(255,255,255,.25)' : c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[type(10, 900), { color: '#fff' }]}>{count}</Text>
          </View>
        ) : null}
      </View>
    </Press>
  );
}

function IconWell({ ico, tone }: { ico: string; tone: Tone }) {
  const c = useC();
  const map: Record<Tone, [string, string]> = {
    '': [c.bg2, c.ink2],
    amber: [c.primaryL, c.primary],
    purple: [c.purpleL, c.purple],
    blue: [c.blueL, c.blue],
    pink: [c.pinkL, c.pink],
    green: [c.greenL, c.green],
  };
  const [bg, fg] = map[tone] || map[''];
  return (
    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={ico} size={19} color={fg} />
    </View>
  );
}
