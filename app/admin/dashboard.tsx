import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, tnum } from '../../src/theme/theme';
import { Screen } from '../../src/ui';
import { money } from '../../src/data/data';
import { useAdminDashboardMetrics } from '../../src/data/hooks';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';

function Card({ label, value, tone, hint }: { label: string; value: string; tone?: 'brand' | 'red' | 'plain'; hint?: string }) {
  const c = useC();
  const color = tone === 'brand' ? c.primary : tone === 'red' ? c.red : c.ink;
  return (
    <View style={{ flex: 1, minWidth: 150, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 16 }}>
      <Text style={[type(24, 900), { color, letterSpacing: -0.7 }, tnum]}>{value}</Text>
      <Text style={[type(12, 700), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }]}>{label}</Text>
      {hint ? <Text style={[type(11.5, 500), { color: c.soft, marginTop: 3 }]}>{hint}</Text> : null}
    </View>
  );
}

function Section({ title }: { title: string }) {
  const c = useC();
  return <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 26, marginBottom: 10, paddingHorizontal: 20 }]}>{title}</Text>;
}

const dash = (v: number | null | undefined) => (v == null ? '—' : String(v));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);

export default function AdminDashboard() {
  const c = useC();
  const [nonce, setNonce] = React.useState(0);
  const { data: m, loading, error } = useAdminDashboardMetrics(7, nonce);

  return (
    <Screen max={1040}>
      <AdminHeader title="Dashboard" sub="Money & marketplace health — last 7 days" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {error ? <ErrorRetry message={error.message} onRetry={() => setNonce((n) => n + 1)} /> : null}

        <Section title="Money" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 }}>
          <Card label="GMV (completed)" value={loading ? '—' : money((m?.gmv_cents ?? 0) / 100)} tone="brand" />
          <Card label="Orders" value={loading ? '—' : dash(m?.orders_count)} />
          <Card label="Payment success" value={loading ? '—' : pct(m?.payment_success_rate_pct)} hint={m?.payment_success_rate_pct == null ? 'Needs Stripe sync (hosted only)' : undefined} />
          <Card label="Refunds" value={loading ? '—' : dash(m?.refund_count)} hint={m?.refund_amount_cents != null ? money(m.refund_amount_cents / 100) : undefined} />
          <Card label="Payouts pending" value={loading ? '—' : dash(m?.payouts_pending_count)} />
          <Card label="Payouts needs review" value={loading ? '—' : dash(m?.payouts_needs_review_count)} tone={(m?.payouts_needs_review_count ?? 0) > 0 ? 'red' : 'plain'} />
          <Card label="Payouts paid" value={loading ? '—' : money((m?.payouts_paid_amount_cents ?? 0) / 100)} />
          <Card label="Ledger unpaid balance" value={loading ? '—' : money((m?.ledger_unpaid_balance_cents ?? 0) / 100)} hint="All-time, all kitchens" />
        </View>

        <Section title="Marketplace" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 }}>
          <Card label="Active cooks" value={loading ? '—' : dash(m?.active_cooks)} />
          <Card label="Live meals" value={loading ? '—' : dash(m?.live_meals_count)} />
          <Card label="Fulfillment rate" value={loading ? '—' : pct(m?.fulfillment_rate_pct)} hint="Completed vs. cancelled" />
        </View>

        <Text style={[type(12, 600), { color: c.muted, textAlign: 'center', marginTop: 26, paddingHorizontal: 30, lineHeight: 18 }]}>
          System health (Vercel/Edge Function errors/cron failures) isn't tracked here yet — it needs external monitoring, not a DB query.
        </Text>
      </ScrollView>
    </Screen>
  );
}
