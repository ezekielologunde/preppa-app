import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, tnum } from '../../src/theme/theme';
import { Screen, Press } from '../../src/ui';
import { StatusTag } from '../../src/ui/layout';
import { Sheet } from '../../src/ui/overlay';
import { money } from '../../src/data/data';
import { useAdminPlans, useAdminSubscriptions } from '../../src/data/hooks';
import * as admin from '../../src/lib/admin';
import { DataTable, Column } from '../../src/components/admin/DataTable';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { fmtDate, fmtDateTime, humanize, planStatusTone, lifecycleTone } from '../../src/components/admin/format';

const m = (cents: number) => money(cents / 100);

function Tabs({ tab, setTab }: { tab: 'plans' | 'subs'; setTab: (t: 'plans' | 'subs') => void }) {
  const c = useC();
  const opt = (key: 'plans' | 'subs', label: string) => (
    <Press scale={0.98} onPress={() => setTab(key)} label={label}>
      <View
        style={{
          paddingVertical: 8,
          paddingHorizontal: 16,
          borderRadius: radius.md,
          backgroundColor: tab === key ? c.ink : 'transparent',
        }}
      >
        <Text style={[type(13.5, 800), { color: tab === key ? c.bg : c.soft }]}>{label}</Text>
      </View>
    </Press>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 4,
        backgroundColor: c.bg2,
        borderRadius: radius.md + 2,
        padding: 4,
        alignSelf: 'flex-start',
        marginHorizontal: 16,
        marginTop: 14,
      }}
    >
      {opt('plans', 'Plans')}
      {opt('subs', 'Subscriptions')}
    </View>
  );
}

export default function AdminPlans() {
  const c = useC();
  const [tab, setTab] = useState<'plans' | 'subs'>('plans');
  return (
    <Screen max={1100}>
      <AdminHeader title="Plans & subscriptions" sub="Read-only visibility into meal plans and active subscriptions" back={true} />
      <Tabs tab={tab} setTab={setTab} />
      {tab === 'plans' ? <PlansTab /> : <SubscriptionsTab />}
    </Screen>
  );
}

function PlansTab() {
  const c = useC();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useAdminPlans(nonce);
  const [detail, setDetail] = useState<admin.AdminPlanDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openPlan = async (row: admin.AdminPlan) => {
    setOpen(true);
    setBusy(true);
    setDetail(null);
    try {
      setDetail(await admin.planDetail(row.plan_id));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<admin.AdminPlan>[] = [
    {
      key: 'plan',
      header: 'Plan',
      flex: 1.5,
      render: (p) => (
        <View style={{ minWidth: 0 }}>
          <Text style={[type(14, 800), { color: c.ink }]} numberOfLines={1}>{p.name}</Text>
          <Text style={[type(11.5, 600), { color: c.muted }]} numberOfLines={1}>{p.kitchen_name ?? '—'}</Text>
        </View>
      ),
    },
    { key: 'model', header: 'Model', width: 130, hideBelow: 760, render: (p) => <Text style={[type(13, 600), { color: c.soft }]}>{humanize(p.selection_model)}</Text> },
    { key: 'subs', header: 'Subscribers', width: 96, align: 'center', hideBelow: 620, render: (p) => <Text style={[type(13, 700), { color: c.soft }, tnum]}>{p.subscriber_count}</Text> },
    { key: 'price', header: 'Price', width: 92, align: 'right', render: (p) => <Text style={[type(14, 900), { color: c.ink }, tnum]}>{m(p.price_cents)}</Text> },
    { key: 'status', header: 'Status', width: 96, render: (p) => <StatusTag label={humanize(p.status)} tone={planStatusTone(p.status)} /> },
    { key: 'date', header: 'Created', width: 78, hideBelow: 760, render: (p) => <Text style={[type(12.5, 600), { color: c.muted }]}>{fmtDate(p.created_at)}</Text> },
  ];

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {error ? (
          <ErrorRetry message={error.message} onRetry={() => setNonce((n) => n + 1)} />
        ) : (
          <DataTable
            columns={columns}
            rows={data ?? []}
            keyOf={(p) => p.plan_id}
            onRowPress={openPlan}
            rowLabel={(p) => `Open plan ${p.name}`}
            loading={loading}
            minWidth={720}
            search={{ placeholder: 'Search plan, kitchen…', value: (p) => `${p.name} ${p.kitchen_name ?? ''}` }}
            empty={{ icon: 'repeat', title: 'No plans yet', body: 'Meal plans a cook publishes will appear here.' }}
          />
        )}
      </ScrollView>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Plan detail" scroll>
        {busy || !detail ? (
          <Text style={[type(14, 600), { color: c.muted, paddingVertical: 20, textAlign: 'center' }]}>Loading…</Text>
        ) : (
          <PlanDetailBody d={detail} />
        )}
      </Sheet>
    </>
  );
}

function PlanDetailBody({ d }: { d: admin.AdminPlanDetail }) {
  const c = useC();
  return (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusTag label={humanize(d.status)} tone={planStatusTone(d.status)} />
        <StatusTag label={humanize(d.selection_model)} tone="neutral" />
        <StatusTag label={humanize(d.fulfillment)} tone="neutral" />
      </View>

      <Row c={c} k="Kitchen" v={d.kitchen_name ?? '—'} />
      <Row c={c} k="Price" v={d.selection_model === 'customer_choice' ? `${money((d.per_meal_cents ?? 0) / 100)}/meal` : m(d.price_cents)} />
      <Row c={c} k="Created" v={fmtDateTime(d.created_at)} />
      {d.description ? <Row c={c} k="Description" v={d.description} /> : null}

      <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }]}>Meals ({d.items.length})</Text>
      <View style={{ backgroundColor: c.bg2, borderRadius: radius.md, padding: 12, gap: 8 }}>
        {d.items.length === 0 ? (
          <Text style={[type(13, 600), { color: c.muted }]}>No meals attached.</Text>
        ) : (
          d.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[type(13.5, 700), { color: c.ink, flex: 1 }]} numberOfLines={1}>{it.qty}× {it.meal_name}</Text>
              <Text style={[type(13.5, 700), { color: c.soft }, tnum]}>{m(it.price_cents)}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }]}>Subscribers ({d.subscribers.length})</Text>
      <View style={{ backgroundColor: c.bg2, borderRadius: radius.md, padding: 12, gap: 8 }}>
        {d.subscribers.length === 0 ? (
          <Text style={[type(13, 600), { color: c.muted }]}>No subscribers yet.</Text>
        ) : (
          d.subscribers.map((s) => (
            <View key={s.subscription_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[type(13.5, 700), { color: c.ink, flex: 1 }]} numberOfLines={1}>{s.customer_name ?? 'Unknown'}</Text>
              <StatusTag label={humanize(s.lifecycle)} tone={lifecycleTone(s.lifecycle)} />
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function SubscriptionsTab() {
  const c = useC();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useAdminSubscriptions(nonce);
  const [detail, setDetail] = useState<admin.AdminSubscriptionDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openSub = async (row: admin.AdminSubscription) => {
    setOpen(true);
    setBusy(true);
    setDetail(null);
    try {
      setDetail(await admin.subscriptionDetail(row.subscription_id));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<admin.AdminSubscription>[] = [
    {
      key: 'customer',
      header: 'Customer',
      flex: 1.4,
      render: (s) => (
        <View style={{ minWidth: 0 }}>
          <Text style={[type(14, 800), { color: c.ink }]} numberOfLines={1}>{s.customer_name ?? 'Unknown'}</Text>
          <Text style={[type(11.5, 600), { color: c.muted }]} numberOfLines={1}>{s.plan_name ?? '—'}</Text>
        </View>
      ),
    },
    { key: 'kitchen', header: 'Kitchen', flex: 1, hideBelow: 820, render: (s) => <Text style={[type(13, 600), { color: c.soft }]} numberOfLines={1}>{s.kitchen_name ?? '—'}</Text> },
    { key: 'kind', header: 'Kind', width: 90, hideBelow: 700, render: (s) => <Text style={[type(13, 600), { color: c.soft }]}>{humanize(s.kind)}</Text> },
    { key: 'next', header: 'Next cycle', width: 92, hideBelow: 640, render: (s) => <Text style={[type(12.5, 600), { color: c.muted }]}>{s.next_cycle_date ? fmtDate(s.next_cycle_date) : '—'}</Text> },
    { key: 'lifecycle', header: 'Lifecycle', width: 132, render: (s) => <StatusTag label={humanize(s.lifecycle)} tone={lifecycleTone(s.lifecycle)} /> },
    { key: 'date', header: 'Since', width: 78, hideBelow: 760, render: (s) => <Text style={[type(12.5, 600), { color: c.muted }]}>{fmtDate(s.created_at)}</Text> },
  ];

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {error ? (
          <ErrorRetry message={error.message} onRetry={() => setNonce((n) => n + 1)} />
        ) : (
          <DataTable
            columns={columns}
            rows={data ?? []}
            keyOf={(s) => s.subscription_id}
            onRowPress={openSub}
            rowLabel={(s) => `Open subscription for ${s.customer_name ?? 'customer'}`}
            loading={loading}
            minWidth={760}
            search={{ placeholder: 'Search customer, kitchen, plan…', value: (s) => `${s.customer_name ?? ''} ${s.kitchen_name ?? ''} ${s.plan_name ?? ''}` }}
            empty={{ icon: 'repeat', title: 'No subscriptions yet', body: 'Customer subscriptions will appear here once someone subscribes to a plan.' }}
          />
        )}
      </ScrollView>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Subscription detail" scroll>
        {busy || !detail ? (
          <Text style={[type(14, 600), { color: c.muted, paddingVertical: 20, textAlign: 'center' }]}>Loading…</Text>
        ) : (
          <SubscriptionDetailBody d={detail} />
        )}
      </Sheet>
    </>
  );
}

function SubscriptionDetailBody({ d }: { d: admin.AdminSubscriptionDetail }) {
  const c = useC();
  return (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusTag label={humanize(d.lifecycle)} tone={lifecycleTone(d.lifecycle)} />
        <StatusTag label={humanize(d.kind)} tone="neutral" />
        {d.cancel_at_cycle_end ? <StatusTag label="Cancels at cycle end" tone="danger" /> : null}
      </View>

      <Row c={c} k="Customer" v={d.customer_name ?? 'Unknown'} />
      <Row c={c} k="Plan" v={d.plan_name ?? '—'} />
      <Row c={c} k="Kitchen" v={d.kitchen_name ?? '—'} />
      <Row c={c} k="Preferred day" v={d.preferred_day ?? '—'} />
      <Row c={c} k="Next cycle" v={d.next_cycle_date ? fmtDate(d.next_cycle_date) : '—'} />
      {d.pause_until ? <Row c={c} k="Paused until" v={fmtDate(d.pause_until)} /> : null}
      {d.failed_charge_count > 0 ? <Row c={c} k="Failed charges" v={String(d.failed_charge_count)} /> : null}
      <Row c={c} k="Since" v={fmtDateTime(d.created_at)} />

      <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }]}>Recent cycles ({d.cycles.length})</Text>
      <View style={{ backgroundColor: c.bg2, borderRadius: radius.md, padding: 12, gap: 10 }}>
        {d.cycles.length === 0 ? (
          <Text style={[type(13, 600), { color: c.muted }]}>No billing cycles yet.</Text>
        ) : (
          d.cycles.map((cy) => (
            <View key={cy.cycle_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[type(13, 700), { color: c.ink, flex: 1 }]}>{fmtDate(cy.cycle_start)} → {fmtDate(cy.delivery_date)}</Text>
              <StatusTag label={humanize(cy.skipped ? 'skipped' : cy.status)} tone={cy.status === 'delivered' || cy.status === 'completed' ? 'success' : cy.skipped ? 'neutral' : 'info'} />
              <Text style={[type(13, 700), { color: c.soft }, tnum]}>{m(cy.total_cents)}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function Row({ c, k, v }: { c: any; k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={[type(13, 700), { color: c.muted, width: 110 }]}>{k}</Text>
      <Text style={[type(13.5, 600), { color: c.ink, flex: 1 }]} numberOfLines={2}>{v}</Text>
    </View>
  );
}
