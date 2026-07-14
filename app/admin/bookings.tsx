import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, tnum } from '../../src/theme/theme';
import { Screen, Press } from '../../src/ui';
import { StatusTag } from '../../src/ui/layout';
import { Sheet } from '../../src/ui/overlay';
import { money } from '../../src/data/data';
import { useAdminServiceRequests, useAdminBookings } from '../../src/data/hooks';
import * as admin from '../../src/lib/admin';
import { DataTable, Column } from '../../src/components/admin/DataTable';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { fmtDate, fmtDateTime, humanize, requestStatusTone, quoteStatusTone, bookingStatusTone } from '../../src/components/admin/format';

const m = (cents: number) => money(cents / 100);

function Tabs({ tab, setTab }: { tab: 'requests' | 'bookings'; setTab: (t: 'requests' | 'bookings') => void }) {
  const c = useC();
  const opt = (key: 'requests' | 'bookings', label: string) => (
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
      {opt('requests', 'Requests & quotes')}
      {opt('bookings', 'Bookings')}
    </View>
  );
}

export default function AdminBookings() {
  const [tab, setTab] = useState<'requests' | 'bookings'>('requests');
  return (
    <Screen max={1100}>
      <AdminHeader title="Service requests & bookings" sub="Read-only visibility into RFQs, quotes, and confirmed bookings" back={true} />
      <Tabs tab={tab} setTab={setTab} />
      {tab === 'requests' ? <RequestsTab /> : <BookingsTab />}
    </Screen>
  );
}

function RequestsTab() {
  const c = useC();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useAdminServiceRequests(nonce);
  const [detail, setDetail] = useState<admin.AdminServiceRequestDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openReq = async (row: admin.AdminServiceRequest) => {
    setOpen(true);
    setBusy(true);
    setDetail(null);
    try {
      setDetail(await admin.serviceRequestDetail(row.request_id));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<admin.AdminServiceRequest>[] = [
    {
      key: 'req',
      header: 'Request',
      flex: 1.4,
      render: (r) => (
        <View style={{ minWidth: 0 }}>
          <Text style={[type(14, 800), { color: c.ink }]} numberOfLines={1}>{r.customer_name ?? 'Unknown'}</Text>
          <Text style={[type(11.5, 600), { color: c.muted }]} numberOfLines={1}>{humanize(r.category)}</Text>
        </View>
      ),
    },
    { key: 'quotes', header: 'Quotes', width: 76, align: 'center', hideBelow: 620, render: (r) => <Text style={[type(13, 700), { color: c.soft }, tnum]}>{r.quote_count}</Text> },
    { key: 'budget', header: 'Budget', width: 92, align: 'right', hideBelow: 700, render: (r) => <Text style={[type(13.5, 700), { color: c.soft }, tnum]}>{r.budget_cents != null ? m(r.budget_cents) : '—'}</Text> },
    { key: 'status', header: 'Status', width: 104, render: (r) => <StatusTag label={humanize(r.status)} tone={requestStatusTone(r.status)} /> },
    { key: 'event', header: 'Event', width: 78, hideBelow: 760, render: (r) => <Text style={[type(12.5, 600), { color: c.muted }]}>{fmtDate(r.event_date)}</Text> },
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
            keyOf={(r) => r.request_id}
            onRowPress={openReq}
            rowLabel={(r) => `Open request from ${r.customer_name ?? 'customer'}`}
            loading={loading}
            minWidth={700}
            search={{ placeholder: 'Search customer, category…', value: (r) => `${r.customer_name ?? ''} ${r.category}` }}
            empty={{ icon: 'calendar', title: 'No requests yet', body: 'Customer service requests will appear here once one is submitted.' }}
          />
        )}
      </ScrollView>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Request detail" scroll>
        {busy || !detail ? (
          <Text style={[type(14, 600), { color: c.muted, paddingVertical: 20, textAlign: 'center' }]}>Loading…</Text>
        ) : (
          <RequestDetailBody d={detail} />
        )}
      </Sheet>
    </>
  );
}

function RequestDetailBody({ d }: { d: admin.AdminServiceRequestDetail }) {
  const c = useC();
  return (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusTag label={humanize(d.status)} tone={requestStatusTone(d.status)} />
        <StatusTag label={humanize(d.category)} tone="neutral" />
      </View>

      <Row c={c} k="Customer" v={d.customer_name ?? 'Unknown'} />
      <Row c={c} k="Event date" v={fmtDate(d.event_date)} />
      <Row c={c} k="Area" v={d.approx_area ?? d.address_text ?? '—'} />
      {d.guests != null ? <Row c={c} k="Guests" v={String(d.guests)} /> : null}
      {d.budget_cents != null ? <Row c={c} k="Budget" v={m(d.budget_cents)} /> : null}
      {d.details ? <Row c={c} k="Details" v={d.details} /> : null}
      <Row c={c} k="Submitted" v={fmtDateTime(d.created_at)} />

      <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }]}>Quotes ({d.quotes.length})</Text>
      <View style={{ backgroundColor: c.bg2, borderRadius: radius.md, padding: 12, gap: 10 }}>
        {d.quotes.length === 0 ? (
          <Text style={[type(13, 600), { color: c.muted }]}>No quotes yet.</Text>
        ) : (
          d.quotes.map((q) => (
            <View key={q.quote_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[type(13.5, 700), { color: c.ink, flex: 1 }]} numberOfLines={1}>{q.kitchen_name ?? 'Unknown kitchen'}</Text>
              <StatusTag label={humanize(q.status)} tone={quoteStatusTone(q.status)} />
              <Text style={[type(13.5, 700), { color: c.soft }, tnum]}>{m(q.amount_cents)}</Text>
            </View>
          ))
        )}
      </View>

      {d.booking ? (
        <>
          <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }]}>Resulting booking</Text>
          <View style={{ backgroundColor: c.bg2, borderRadius: radius.md, padding: 12, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <StatusTag label={humanize(d.booking.status)} tone={bookingStatusTone(d.booking.status)} />
              <Text style={[type(13.5, 700), { color: c.soft, flex: 1, textAlign: 'right' }, tnum]}>{m(d.booking.amount_cents)}</Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

function BookingsTab() {
  const c = useC();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useAdminBookings(nonce);
  const [detail, setDetail] = useState<admin.AdminBookingDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openBooking = async (row: admin.AdminBooking) => {
    setOpen(true);
    setBusy(true);
    setDetail(null);
    try {
      setDetail(await admin.bookingDetail(row.booking_id));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<admin.AdminBooking>[] = [
    {
      key: 'booking',
      header: 'Booking',
      flex: 1.4,
      render: (b) => (
        <View style={{ minWidth: 0 }}>
          <Text style={[type(14, 800), { color: c.ink }]} numberOfLines={1}>{b.customer_name ?? 'Unknown'}</Text>
          <Text style={[type(11.5, 600), { color: c.muted }]} numberOfLines={1}>{b.kitchen_name ?? '—'}</Text>
        </View>
      ),
    },
    { key: 'kind', header: 'Kind', width: 92, hideBelow: 700, render: (b) => <Text style={[type(13, 600), { color: c.soft }]}>{humanize(b.booking_kind)}</Text> },
    { key: 'amount', header: 'Amount', width: 92, align: 'right', render: (b) => <Text style={[type(14, 900), { color: c.ink }, tnum]}>{m(b.amount_cents)}</Text> },
    { key: 'status', header: 'Status', width: 116, render: (b) => <StatusTag label={humanize(b.status)} tone={bookingStatusTone(b.status)} /> },
    { key: 'event', header: 'Event', width: 78, hideBelow: 760, render: (b) => <Text style={[type(12.5, 600), { color: c.muted }]}>{fmtDate(b.event_date)}</Text> },
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
            keyOf={(b) => b.booking_id}
            onRowPress={openBooking}
            rowLabel={(b) => `Open booking for ${b.customer_name ?? 'customer'}`}
            loading={loading}
            minWidth={700}
            search={{ placeholder: 'Search customer, kitchen…', value: (b) => `${b.customer_name ?? ''} ${b.kitchen_name ?? ''}` }}
            empty={{ icon: 'calendar', title: 'No bookings yet', body: 'Confirmed RFQ and experience bookings will appear here.' }}
          />
        )}
      </ScrollView>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Booking detail" scroll>
        {busy || !detail ? (
          <Text style={[type(14, 600), { color: c.muted, paddingVertical: 20, textAlign: 'center' }]}>Loading…</Text>
        ) : (
          <BookingDetailBody d={detail} />
        )}
      </Sheet>
    </>
  );
}

function BookingDetailBody({ d }: { d: admin.AdminBookingDetail }) {
  const c = useC();
  return (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusTag label={humanize(d.status)} tone={bookingStatusTone(d.status)} />
        <StatusTag label={humanize(d.booking_kind)} tone="neutral" />
      </View>

      <Row c={c} k="Customer" v={d.customer_name ?? 'Unknown'} />
      <Row c={c} k="Kitchen" v={d.kitchen_name ?? '—'} />
      <Row c={c} k="Event date" v={fmtDate(d.event_date)} />
      {d.address_text ? <Row c={c} k="Address" v={d.address_text} /> : null}
      {d.guests != null ? <Row c={c} k="Guests" v={String(d.guests)} /> : null}
      <Row c={c} k="Booked" v={fmtDateTime(d.created_at)} />
      {d.confirmed_at ? <Row c={c} k="Confirmed" v={fmtDateTime(d.confirmed_at)} /> : null}
      {d.completed_at ? <Row c={c} k="Completed" v={fmtDateTime(d.completed_at)} /> : null}
      {d.cancelled_at ? <Row c={c} k="Cancelled" v={fmtDateTime(d.cancelled_at)} /> : null}

      <View style={{ gap: 6, marginTop: 2 }}>
        <Amount c={c} k="Total" v={m(d.amount_cents)} />
        <Amount c={c} k="Deposit" v={m(d.deposit_cents)} />
        {d.balance_cents != null ? <Amount c={c} k="Balance due" v={m(d.balance_cents)} /> : null}
        <Amount c={c} k="Service fee" v={m(d.service_fee_cents)} />
      </View>

      {d.request ? (
        <>
          <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }]}>Originating request</Text>
          <View style={{ backgroundColor: c.bg2, borderRadius: radius.md, padding: 12, gap: 6 }}>
            <Text style={[type(13.5, 700), { color: c.ink }]}>{humanize(d.request.category)}</Text>
            {d.request.details ? <Text style={[type(13, 600), { color: c.soft }]}>{d.request.details}</Text> : null}
          </View>
        </>
      ) : null}
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

function Amount({ c, k, v }: { c: any; k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={[type(13.5, 600), { color: c.soft, flex: 1 }]}>{k}</Text>
      <Text style={[type(13.5, 700), { color: c.ink }, tnum]}>{v}</Text>
    </View>
  );
}
