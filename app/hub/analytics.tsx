import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { Icon, GradBox } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { money } from '../../src/data/data';
import { getMyKitchen } from '../../src/lib/connect';
import { fetchCookAnalyticsSummary, CookAnalyticsSummary } from '../../src/lib/orders';
import { StatTile, well, Tone } from '../(tabs)/my-hub';

function Bars({ data }: { data: number[] }) {
  const max = Math.max(1, ...data); // guard: empty/all-zero data must not yield NaN/Infinity heights
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120, marginTop: 18 }}>
      {data.map((v, i) => {
        const pct = Math.min(100, Math.max(6, (v / max) * 100));
        const last = i === data.length - 1;
        return (
          <GradBox key={i} grad={last ? ['#E24A38', '#C0560F'] : ['#FFB37A', '#E24A38']} style={{ flex: 1, height: `${pct}%`, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
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
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CookAnalyticsSummary | null>(null);
  const weeks = ['8w', '7w', '6w', '5w', '4w', '3w', '2w', 'now'];

  useEffect(() => {
    (async () => {
      const k = await getMyKitchen();
      if (k) {
        try { setData(await fetchCookAnalyticsSummary(k.id)); } catch { /* keep null → empty state below */ }
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Screen>
        <TopBar title="Analytics" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      </Screen>
    );
  }

  const revenue = data?.weeklyRevenueCents.map((v) => v / 100) ?? [0, 0, 0, 0, 0, 0, 0, 0];
  const total = revenue.reduce((s, v) => s + v, 0);

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
            {total > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Icon name="trendUp" size={14} color={c.green} />
                <Text style={[type(12.5, 800), { color: c.green }]}>Trending up</Text>
              </View>
            ) : null}
          </View>
          <Bars data={revenue} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
            {weeks.map((w, i) => <Text key={i} style={[type(10.5, 700), { color: c.muted, flex: 1, textAlign: 'center' }]}>{w}</Text>)}
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatTile ic="box" tone="ic-amber" value={String(data?.ordersThisMonth ?? 0)} label="Orders this month" />
            <StatTile ic="dollar" tone="ic-green" value={money((data?.avgOrderCents ?? 0) / 100)} label="Avg order value" />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatTile ic="repeat" tone="ic-purple" value={`${data?.repeatCustomerPct ?? 0}%`} label="Repeat customers" />
            <StatTile ic="users" tone="ic-amber" value={String(data?.newCustomers30d ?? 0)} label="New customers · 30d" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 20, paddingTop: 26, paddingBottom: 12 }}>
          <Text style={[type(17, 900), { color: c.ink, letterSpacing: -0.5 }]}>Top meals</Text>
          <Text style={[type(13, 800), { color: c.muted, marginLeft: 8 }]}>by orders · last 90 days</Text>
        </View>
        {data?.topMeals.length ? (
          <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, paddingVertical: 6 }}>
            {data.topMeals.map((t, i) => (
              <View key={i} style={{ paddingHorizontal: 16, paddingVertical: 13 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text numberOfLines={1} style={[type(13.5, 800), { color: c.ink, flex: 1 }]}>{t.name}</Text>
                  <Text style={[type(12.5, 700), { color: c.soft, marginLeft: 12 }]}>{t.sold} sold</Text>
                </View>
                <View style={{ height: 8, borderRadius: 999, backgroundColor: c.bg2, marginTop: 8, overflow: 'hidden' }}>
                  <GradBox grad={['#FF8A4C', '#E24A38']} style={{ height: '100%', width: `${Math.min(100, Math.max(0, t.pct))}%`, borderRadius: 999 }} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 20, alignItems: 'center' }}>
            <Text style={[type(13, 700), { color: c.soft }]}>No sales yet in the last 90 days</Text>
          </View>
        )}

        <Text style={[type(17, 900), { color: c.ink, letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 26, paddingBottom: 12 }]}>Customer loyalty</Text>
        <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, paddingHorizontal: 16 }}>
          <BreakRow ic="repeat" tone="ic-green" label="Repeat order rate" value={`${data?.repeatCustomerPct ?? 0}%`} />
          <BreakRow ic="users" tone="ic-purple" label="New customers · 30d" value={String(data?.newCustomers30d ?? 0)} last />
        </View>
        <Text style={[type(11.5, 600), { color: c.muted, paddingHorizontal: 20, paddingTop: 10, lineHeight: 16 }]}>
          Profile views and view→order conversion aren't tracked yet — coming in a future update.
        </Text>
      </ScrollView>
    </Screen>
  );
}
