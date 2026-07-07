import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { Icon, GradBox } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { money } from '../../src/data/data';
import { ANALYTICS, MY_PLANS, ME } from '../../src/data/cook';
import { StatTile, well, Tone } from '../(tabs)/my-hub';

function Bars({ data }: { data: number[] }) {
  const max = Math.max(1, ...data); // guard: empty/all-zero data must not yield NaN/Infinity heights
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120, marginTop: 18 }}>
      {data.map((v, i) => {
        const pct = Math.min(100, Math.max(6, (v / max) * 100));
        const last = i === data.length - 1;
        return (
          <GradBox key={i} grad={last ? ['#F26B1D', '#C0560F'] : ['#FFB37A', '#F26B1D']} style={{ flex: 1, height: `${pct}%`, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
        );
      })}
    </View>
  );
}

function BreakRow({ ic, tone, label, value, last }: { ic: string; tone: Tone; label: string; value: string; last?: boolean }) {
  const c = useC();
  const [bg, fg] = well(c, tone);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={ic} size={15} color={fg} />
        </View>
        <Text numberOfLines={1} style={[type(13.5, 700), { color: c.soft, flex: 1 }]}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={[type(15, 900), { color: c.ink, letterSpacing: -0.3, marginLeft: 12 }]}>{value}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const c = useC();
  const router = useRouter();
  const A = ANALYTICS;
  const total = A.revenue.reduce((s, v) => s + v, 0);
  const recurring = MY_PLANS.reduce((s, p) => s + p.subs * p.price, 0);
  const subs = MY_PLANS.reduce((s, p) => s + p.subs, 0);
  const weeks = ['8w', '7w', '6w', '5w', '4w', '3w', '2w', 'now'];

  return (
    <Screen>
      <TopBar title="Analytics" sub="Last 8 weeks" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <View>
              <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4 }]}>Revenue</Text>
              <Text style={[type(26, 900), { color: c.ink, letterSpacing: -1 }]}>{money(total)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="trendUp" size={14} color={c.green} />
              <Text style={[type(12.5, 800), { color: c.green }]}>Trending up</Text>
            </View>
          </View>
          <Bars data={A.revenue} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
            {weeks.map((w, i) => <Text key={i} style={[type(10.5, 700), { color: c.muted, flex: 1, textAlign: 'center' }]}>{w}</Text>)}
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatTile ic="box" tone="ic-amber" value={String(A.orders)} label="Orders this month" />
            <StatTile ic="dollar" tone="ic-green" value={money(A.aov)} label="Avg order value" />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatTile ic="repeat" tone="ic-purple" value={`${A.repeat}%`} label="Repeat customers" />
            <StatTile ic="star" tone="ic-blue" value={String(A.rating)} label={`Rating · ${ME.reviews}`} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatTile ic="repeat" tone="ic-green" value={money(recurring)} label="Reserved · weekly" />
            <StatTile ic="users" tone="ic-amber" value={String(subs)} label="Plan reservations" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 20, paddingTop: 26, paddingBottom: 12 }}>
          <Text style={[type(17, 900), { color: c.ink, letterSpacing: -0.5 }]}>Top meals</Text>
          <Text style={[type(13, 800), { color: c.muted, marginLeft: 8 }]}>by orders</Text>
        </View>
        <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, paddingVertical: 6 }}>
          {A.top.map((t, i) => (
            <View key={i} style={{ paddingHorizontal: 16, paddingVertical: 13 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text numberOfLines={1} style={[type(13.5, 800), { color: c.ink, flex: 1 }]}>{t.name}</Text>
                <Text style={[type(12.5, 700), { color: c.soft, marginLeft: 12 }]}>{t.sold} sold</Text>
              </View>
              <View style={{ height: 8, borderRadius: 999, backgroundColor: c.bg2, marginTop: 8, overflow: 'hidden' }}>
                <GradBox grad={['#FF8A4C', '#F26B1D']} style={{ height: '100%', width: `${Math.min(100, Math.max(0, t.pct))}%`, borderRadius: 999 }} />
              </View>
            </View>
          ))}
        </View>

        <Text style={[type(17, 900), { color: c.ink, letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 26, paddingBottom: 12 }]}>How customers find you</Text>
        <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, paddingHorizontal: 16 }}>
          <BreakRow ic="eye" tone="ic-blue" label="Profile views" value={A.views.toLocaleString()} />
          <BreakRow ic="box" tone="ic-amber" label="Views → orders" value={`${A.conv}%`} />
          <BreakRow ic="repeat" tone="ic-green" label="Repeat order rate" value={`${A.repeat}%`} />
          <BreakRow ic="users" tone="ic-purple" label="New customers · 30d" value="38" last />
        </View>
      </ScrollView>
    </Screen>
  );
}
