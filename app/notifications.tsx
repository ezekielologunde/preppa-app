import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { NOTIFS, CONVERSATIONS, COOKS } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { Icon, Press, Avatar } from '../src/ui';
import { Screen, TopBar } from '../src/ui/layout';

type Tone = '' | 'amber' | 'purple' | 'blue' | 'pink' | 'green';

export default function Notifications() {
  const c = useC();
  const router = useRouter();
  const [tab, setTab] = useState<'alerts' | 'messages'>('alerts');
  const unreadAlerts = NOTIFS.filter((n) => n.unread).length;
  const unreadMsgs = CONVERSATIONS.reduce((s, cv) => s + (cv.unread ? 1 : 0), 0);

  return (
    <Screen>
      <TopBar title="Notifications" />
      <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border2, flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
        <Seg label="Alerts" count={unreadAlerts} on={tab === 'alerts'} onPress={() => setTab('alerts')} />
        <Seg label="Messages" count={unreadMsgs} on={tab === 'messages'} onPress={() => setTab('messages')} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {tab === 'alerts'
          ? NOTIFS.map((n, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 15, paddingHorizontal: 16, backgroundColor: n.unread ? c.unread : c.surface, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
                <IconWell ico={n.ico} tone={n.cls as Tone} />
                <View style={{ flex: 1 }}>
                  <Text style={[type(14.5, 800), { color: c.ink }]}>{n.title}</Text>
                  <Text style={[type(13, 500), { color: c.soft, marginTop: 2, lineHeight: 18 }]}>{n.body}</Text>
                </View>
                <Text style={[type(11, 700), { color: c.muted }]}>{n.time}</Text>
                {n.unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary, marginTop: 4 }} /> : null}
              </View>
            ))
          : CONVERSATIONS.map((cv, i) => {
              const cook = COOKS[cv.cook];
              return (
                <Press key={i} scale={0.99} onPress={() => router.push(`/chat/${cv.cook}`)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
                    <View>
                      <Avatar cook={cv.cook} size={50} rad={16} />
                      {cv.online ? <View style={{ position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: c.green2, borderWidth: 2.5, borderColor: c.surface }} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Text style={[type(15, 800), { color: c.ink }]}>{cook.name}</Text>
                        <Text style={[type(11, 600), { color: c.muted }]}>{cv.time}</Text>
                      </View>
                      <Text numberOfLines={1} style={[type(13, cv.unread ? 700 : 500), { color: cv.unread ? c.ink : c.soft, marginTop: 2 }]}>{cv.msg}</Text>
                    </View>
                    {cv.unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary }} /> : null}
                  </View>
                </Press>
              );
            })}
        <Text style={[type(12.5, 600), { color: c.muted, textAlign: 'center', paddingVertical: 24, paddingHorizontal: 16 }]}>Messages are kept on Preppa for your safety.</Text>
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
