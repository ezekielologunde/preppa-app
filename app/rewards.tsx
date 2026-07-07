import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow, WARM_GRAD } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, Block } from '../src/ui/layout';
import { shareAndNotify, copyText, SITE } from '../src/lib/share';

type Tone = 'amber' | 'purple' | 'blue' | 'pink' | 'green';

const REFERRAL_CODE = 'JORDAN-PREPPA';

export default function Rewards() {
  const c = useC();
  const { toast } = useStore();
  const copyCode = async () => {
    const ok = await copyText(REFERRAL_CODE);
    toast(ok ? 'Code copied' : 'Copy not available on this device', ok ? 'check' : 'info', ok);
  };

  const earn: { ico: string; tone: Tone; t: string; s: string }[] = [
    { ico: 'gift', tone: 'green', t: 'Refer a friend', s: 'You both get $10 in credit' },
    { ico: 'star', tone: 'amber', t: 'Rate an order', s: 'Leave a review after delivery' },
    { ico: 'repeat', tone: 'purple', t: 'Order weekly', s: 'Keep a streak going' },
    { ico: 'users', tone: 'blue', t: 'Follow a cook', s: 'Discover new kitchens' },
  ];
  const earnPts = ['+500 pts', '+40 pts', 'Streak', '+20 pts'];

  const history: { t: string; sub: string; amt: string; up: boolean }[] = [
    { t: 'Rated Honey Garlic Salmon', sub: '1h ago', amt: '+40', up: true },
    { t: 'Referred Priya', sub: '2d ago', amt: '+500', up: true },
    { t: 'Redeemed free delivery', sub: '1w ago', amt: '−200', up: false },
  ];

  return (
    <Screen>
      <TopBar title="Rewards & referrals" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* rewards hero */}
        <View style={{ backgroundColor: c.feature, margin: 16, borderRadius: radius.xl, padding: 18, overflow: 'hidden', ...shadow.hero }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={[type(11, 800), { color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: 0.4 }]}>Preppa Rewards</Text>
              <Text style={[type(30, 900), { color: '#fff', letterSpacing: -0.8, marginTop: 2 }]}>340 pts</Text>
            </View>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(242,107,29,.2)', alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={20} color={c.primary} /></View>
          </View>
          <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.14)', marginTop: 14, overflow: 'hidden' }}>
            <LinearGradient colors={WARM_GRAD as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: '68%', height: '100%', borderRadius: radius.pill }} />
          </View>
          <Text style={[type(12, 600), { color: 'rgba(255,255,255,.7)', marginTop: 12 }]}>160 pts to your next <Text style={{ color: '#fff', fontFamily: type(12, 800).fontFamily }}>free delivery</Text> reward.</Text>
        </View>

        {/* ways to earn */}
        <Block title="Ways to earn">
          {earn.map((e, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border2 }}>
              <Well ico={e.ico} tone={e.tone} />
              <View style={{ flex: 1 }}>
                <Text style={[type(14.5, 800), { color: c.ink }]}>{e.t}</Text>
                <Text style={[type(12.5, 500), { color: c.soft, marginTop: 2 }]}>{e.s}</Text>
              </View>
              <Text style={[type(13, 900), { color: c.primary }]}>{earnPts[i]}</Text>
            </View>
          ))}
        </Block>

        {/* refer a friend */}
        <Block title="Refer a friend">
          <Text style={[type(13, 600), { color: c.soft, marginBottom: 12, lineHeight: 19 }]}>Share your code — when a friend places their first order, you both get $10 in credit.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: c.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed', paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center' }}>
              <Text style={[type(16, 900), { color: c.ink, letterSpacing: 1 }]}>{REFERRAL_CODE}</Text>
            </View>
            <Press scale={0.94} onPress={copyCode}>
              <View style={{ height: 48, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
                <Icon name="card" size={16} color={c.primary} />
                <Text style={[type(13.5, 800), { color: c.primary }]}>Copy</Text>
              </View>
            </Press>
          </View>
          <View style={{ height: 12 }} />
          <Btn label="Share your invite" icon="share" block onPress={() => shareAndNotify(toast, { title: 'Join me on Preppa', url: `${SITE}/?ref=${REFERRAL_CODE}` })} />
        </Block>

        {/* points history */}
        <Block title="Points history">
          {history.map((h, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border2 }}>
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: h.up ? c.greenL : c.pinkL, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={h.up ? 'plus' : 'ticket'} size={18} color={h.up ? c.green : c.red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type(14, 700), { color: c.ink }]}>{h.t}</Text>
                <Text style={[type(12, 500), { color: c.muted, marginTop: 2 }]}>{h.sub}</Text>
              </View>
              <Text style={[type(14, 900), { color: h.up ? c.green : c.red }]}>{h.amt}</Text>
            </View>
          ))}
        </Block>
      </ScrollView>
    </Screen>
  );
}

function Well({ ico, tone }: { ico: string; tone: Tone }) {
  const c = useC();
  const map: Record<Tone, [string, string]> = {
    amber: [c.primaryL, c.primary],
    purple: [c.purpleL, c.purple],
    blue: [c.blueL, c.blue],
    pink: [c.pinkL, c.pink],
    green: [c.greenL, c.green],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={ico} size={19} color={fg} />
    </View>
  );
}
