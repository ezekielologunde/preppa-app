import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, tnum } from '../../src/theme/theme';
import { Screen } from '../../src/ui';
import { StatusTag } from '../../src/ui/layout';
import { Sheet } from '../../src/ui/overlay';
import { money } from '../../src/data/data';
import { useAdminOrders } from '../../src/data/hooks';
import * as admin from '../../src/lib/admin';
import { DataTable, Column } from '../../src/components/admin/DataTable';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { fmtDate, fmtDateTime, humanize, payTone, piTone, orderStatusTone } from '../../src/components/admin/format';

const m = (cents: number) => money(cents / 100);

export default function AdminOrders() {
  const c = useC();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useAdminOrders(nonce);
  const [detail, setDetail] = useState<admin.AdminOrderDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openOrder = async (row: admin.AdminOrder) => {
    setOpen(true);
    setBusy(true);
    setDetail(null);
    try {
      setDetail(await admin.orderDetail(row.order_id));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<admin.AdminOrder>[] = [
    {
      key: 'order',
      header: 'Order',
      flex: 1.5,
      render: (o) => (
        <View style={{ minWidth: 0 }}>
          <Text style={[type(14, 800), { color: c.ink }]} numberOfLines={1}>{o.buyer_name ?? 'Unknown'}</Text>
          <Text style={[type(11.5, 600), { color: c.muted }, tnum]}>#{o.order_id.slice(0, 8)}</Text>
        </View>
      ),
    },
    { key: 'kitchen', header: 'Kitchen', flex: 1, hideBelow: 820, render: (o) => <Text style={[type(13, 600), { color: c.soft }]} numberOfLines={1}>{o.kitchen_name ?? '—'}</Text> },
    { key: 'items', header: 'Items', width: 54, align: 'center', hideBelow: 700, render: (o) => <Text style={[type(13, 700), { color: c.soft }, tnum]}>{o.item_count}</Text> },
    { key: 'amount', header: 'Amount', width: 92, align: 'right', render: (o) => <Text style={[type(14, 900), { color: c.ink }, tnum]}>{m(o.total_cents)}</Text> },
    { key: 'pay', header: 'Payment', width: 116, render: (o) => <StatusTag label={humanize(o.pi_status ?? o.pay_status)} tone={o.pi_status ? piTone(o.pi_status) : payTone(o.pay_status)} /> },
    { key: 'status', header: 'Status', width: 104, hideBelow: 600, render: (o) => <StatusTag label={humanize(o.status)} tone={orderStatusTone(o.status)} /> },
    { key: 'date', header: 'Date', width: 78, hideBelow: 760, render: (o) => <Text style={[type(12.5, 600), { color: c.muted }]}>{fmtDate(o.created_at)}</Text> },
  ];

  return (
    <Screen max={1100}>
      <AdminHeader title="Orders & payments" sub={loading ? 'Loading…' : `${data?.length ?? 0} orders`} back={true} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {error ? (
          <ErrorRetry message={error.message} onRetry={() => setNonce((n) => n + 1)} />
        ) : (
          <DataTable
            columns={columns}
            rows={data ?? []}
            keyOf={(o) => o.order_id}
            onRowPress={openOrder}
            rowLabel={(o) => `Open order ${o.order_id.slice(0, 8)}`}
            loading={loading}
            minWidth={720}
            search={{ placeholder: 'Search buyer, kitchen…', value: (o) => `${o.buyer_name ?? ''} ${o.kitchen_name ?? ''} ${o.order_id}` }}
            empty={{ icon: 'bag', title: 'No orders yet', body: 'Real orders will appear here once a buyer checks out.' }}
          />
        )}
      </ScrollView>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Order detail" scroll>
        {busy || !detail ? (
          <Text style={[type(14, 600), { color: c.muted, paddingVertical: 20, textAlign: 'center' }]}>Loading…</Text>
        ) : (
          <OrderDetailBody d={detail} />
        )}
      </Sheet>
    </Screen>
  );
}

function OrderDetailBody({ d }: { d: admin.AdminOrderDetail }) {
  const c = useC();
  return (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusTag label={humanize(d.status)} tone={orderStatusTone(d.status)} />
        <StatusTag label={humanize(d.pi_status ?? d.pay_status)} tone={d.pi_status ? piTone(d.pi_status) : payTone(d.pay_status)} />
        <StatusTag label={d.method} tone="neutral" />
        {d.handoff_status ? <StatusTag label={`handoff ${humanize(d.handoff_status)}`} tone="neutral" /> : null}
      </View>

      <Row c={c} k="Buyer" v={d.buyer_name ?? 'Unknown'} />
      <Row c={c} k="Kitchen" v={d.kitchen_name ?? '—'} />
      <Row c={c} k="Fulfillment" v={humanize(d.fulfillment)} />
      <Row c={c} k="Placed" v={fmtDateTime(d.created_at)} />
      {d.pi_stripe_id ? <Row c={c} k="Stripe PI" v={d.pi_stripe_id} mono /> : null}

      <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }]}>Items</Text>
      <View style={{ backgroundColor: c.bg2, borderRadius: radius.md, padding: 12, gap: 8 }}>
        {d.items.length === 0 ? (
          <Text style={[type(13, 600), { color: c.muted }]}>No line items.</Text>
        ) : (
          d.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[type(13.5, 700), { color: c.ink, flex: 1 }]} numberOfLines={1}>{it.qty}× {it.name}</Text>
              <Text style={[type(13.5, 700), { color: c.soft }, tnum]}>{m(it.unit_price_cents * it.qty)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={{ gap: 6, marginTop: 2 }}>
        <Amount c={c} k="Subtotal" v={m(d.subtotal_cents)} />
        <Amount c={c} k="Service fee" v={m(d.service_fee_cents)} />
        {d.tip_cents > 0 ? <Amount c={c} k="Tip" v={m(d.tip_cents)} /> : null}
        <View style={{ height: 1, backgroundColor: c.border2, marginVertical: 4 }} />
        <Amount c={c} k="Total" v={m(d.total_cents)} bold />
      </View>
    </View>
  );
}

function Row({ c, k, v, mono }: { c: any; k: string; v: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={[type(13, 700), { color: c.muted, width: 96 }]}>{k}</Text>
      <Text style={[type(13.5, 600), { color: c.ink, flex: 1 }, mono ? tnum : null]} numberOfLines={1}>{v}</Text>
    </View>
  );
}

function Amount({ c, k, v, bold }: { c: any; k: string; v: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={[type(bold ? 15 : 13.5, bold ? 900 : 600), { color: bold ? c.ink : c.soft, flex: 1 }]}>{k}</Text>
      <Text style={[type(bold ? 16 : 13.5, bold ? 900 : 700), { color: c.ink }, tnum]}>{v}</Text>
    </View>
  );
}
