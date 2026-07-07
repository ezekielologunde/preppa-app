import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Line } from 'react-native-svg';
import { COOKS, CookId } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Avatar, Btn } from '../src/ui';
import { Screen, TopBar } from '../src/ui/layout';

export default function Track() {
  const c = useC();
  const router = useRouter();
  const { flow, cook } = useLocalSearchParams<{ flow: string; cook?: string }>();
  const { mode, toast } = useStore();
  const cod = flow === 'cod';
  const ck = ((cook || 'maria') as CookId);
  const theCook = COOKS[ck];

  const STEPS = [
    { t: 'Order confirmed', p: `${theCook.name} accepted your order`, st: 'done' },
    { t: 'Cooking now', p: 'Fresh on the stove', st: cod ? 'done' : 'active' },
    { t: mode === 'pickup' ? 'Ready for pickup' : 'Out for delivery', p: mode === 'pickup' ? `Head to ${theCook.kitchen}` : 'On the way to you', st: cod ? 'done' : 'pending' },
    { t: cod ? 'Handed off · paid in cash' : 'Delivered', p: cod ? 'Confirmed by QR + code' : 'Leave a review to earn points', st: cod ? 'done' : 'pending' },
  ];

  return (
    <Screen>
      <TopBar title={cod ? 'Order complete' : 'Track order'} sub="#PR-2048" onBack={() => router.replace('/home')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* map */}
        <View style={{ height: 180, backgroundColor: '#F3F3F7', overflow: 'hidden' }}>
          <Svg width="100%" height={180}>
            {Array.from({ length: 20 }).map((_, i) => (
              <Line key={`v${i}`} x1={i * 28} y1={0} x2={i * 28} y2={180} stroke="#E7E7EF" strokeWidth={1} />
            ))}
            {Array.from({ length: 7 }).map((_, i) => (
              <Line key={`h${i}`} x1={0} y1={i * 28} x2={600} y2={i * 28} stroke="#E7E7EF" strokeWidth={1} />
            ))}
            <Line x1={44} y1={70} x2={300} y2={70} stroke={c.primary} strokeWidth={3} strokeDasharray="8 6" strokeLinecap="round" />
          </Svg>
          <Pin left={30} bg={c.ink} icon="chefhat" />
          <Pin right={46} bg={c.primary} icon="home" />
        </View>

        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, marginTop: -22, padding: 18, paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={[type(12, 700), { color: c.muted, textTransform: 'uppercase' }]}>{cod ? 'Status' : 'Estimated arrival'}</Text>
              <Text style={[type(24, 900), { color: c.ink, letterSpacing: -0.6 }]}>{cod ? 'Completed' : '5:32 PM'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.greenL }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.green }} />
              <Text style={[type(12.5, 900), { color: c.green }]}>{cod ? 'Delivered' : 'Live'}</Text>
            </View>
          </View>

          <View style={{ marginTop: 20 }}>
            {STEPS.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: s.st === 'done' ? c.green : s.st === 'active' ? c.primary : c.bg2 }}>
                    {s.st === 'done' ? <Icon name="check" size={15} color="#fff" /> : s.st === 'active' ? <Icon name="chefhat" size={15} color="#fff" /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.muted }} />}
                  </View>
                  {i < STEPS.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 26, backgroundColor: s.st === 'done' ? c.green : c.border }} /> : null}
                </View>
                <View style={{ paddingBottom: 20, flex: 1 }}>
                  <Text style={[type(15, 800), { color: s.st === 'pending' ? c.muted : c.ink }]}>{s.t}</Text>
                  <Text style={[type(12.5, 500), { color: c.soft, marginTop: 2 }]}>{s.p}</Text>
                </View>
              </View>
            ))}
          </View>

          <Press scale={0.98} onPress={() => router.push(`/chat/${ck}`)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: radius.lg, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}>
              <Avatar cook={ck} size={46} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={[type(15, 900), { color: c.ink }]}>{theCook.name}</Text><Icon name="shield" size={15} color={c.green} /></View>
                <Text style={[type(12, 600), { color: c.soft, marginTop: 2 }]}>Your cook · usually replies in minutes</Text>
              </View>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="chat" size={16} color={c.soft} /></View>
            </View>
          </Press>

          <Press scale={0.98} onPress={() => router.push('/plans')} style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: c.primaryL, borderWidth: 1, borderColor: c.primary }}>
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="repeat" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type(14.5, 900), { color: c.ink, letterSpacing: -0.2 }]}>Loved it? Get this every week</Text>
                <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>Reserve a weekly box from {theCook.name} — launching soon</Text>
              </View>
              <Icon name="chevRight" size={18} color={c.primary} />
            </View>
          </Press>

          {!cod ? (
            <View style={{ marginTop: 14, padding: 14, borderRadius: radius.lg, backgroundColor: c.purpleL, borderWidth: 1, borderColor: c.purple }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="qr" size={20} color={c.purple} />
                <Text style={[type(12.5, 700), { color: c.purple, flex: 1, lineHeight: 18 }]}>
                  {mode === 'pickup' ? 'Show your code when you collect — your cook scans it to confirm the right order.' : 'Show your code at the door — your cook scans it to confirm the handoff.'}
                </Text>
              </View>
              <View style={{ marginTop: 12 }}>
                <Btn icon="qr" label={mode === 'pickup' ? 'Show pickup code' : 'Show handoff code'} block onPress={() => router.push(`/handoff?mode=${mode}&cook=${ck}`)} />
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            {!cod ? <Btn variant="ghost" label="Get help" flex={1} onPress={() => toast('Order help — demo', 'help')} /> : null}
            <Btn label={cod ? 'Back to home' : 'Done'} flex={1} onPress={() => router.replace('/home')} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Pin({ left, right, bg, icon }: { left?: number; right?: number; bg: string; icon: string }) {
  return (
    <View style={{ position: 'absolute', top: 48, left, right, width: 34, height: 34, borderRadius: 17, borderBottomRightRadius: 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 }}>
      <View style={{ transform: [{ rotate: '-45deg' }] }}><Icon name={icon} size={16} color="#fff" /></View>
    </View>
  );
}
