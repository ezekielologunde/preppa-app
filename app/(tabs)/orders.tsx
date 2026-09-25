import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cookOfLine, money, thumb } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore, CustomerOrder } from '../../src/store/store';
import { Icon, Press, GradBox, Btn } from '../../src/ui';
import { Empty } from '../../src/ui/layout';
import { listMyBookings, completeBooking, cancelBooking, type BookingView } from '../../src/lib/services';
import { cancelExperienceBooking, fetchExperienceMeetingUrl } from '../../src/lib/experiences';
import { confirmAction } from '../../src/lib/confirm';

const STATUS: Record<CustomerOrder['status'], { label: string; bg: (c: any) => string; fg: (c: any) => string }> = {
  confirming: { label: 'Confirming payment', bg: (c) => c.bg2, fg: (c) => c.soft },
  confirmed: { label: 'Confirmed', bg: (c) => c.bg2, fg: (c) => c.ink2 },
  preparing: { label: 'Preparing', bg: (c) => c.primaryL, fg: (c) => c.primaryD },
  ready: { label: 'Ready', bg: (c) => c.greenL, fg: (c) => c.green },
  completed: { label: 'Completed', bg: (c) => c.bg2, fg: (c) => c.soft },
  cancelled: { label: 'Cancelled', bg: (c) => c.redL, fg: (c) => c.red },
};

/** Unified activity: meal orders + service bookings. (Weekly plans live under Experiences → My Plans.) */
export default function Orders() {
  const c = useC();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orders, ordersLoading, ordersError, refreshOrders, toast, refreshOrderStatus } = useStore();
  const [bookings, setBookings] = useState<BookingView[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const bookingActionInFlight = useRef(false);
  const bookingLoadSequence = useRef(0);
  const load = useCallback(() => {
    const sequence = ++bookingLoadSequence.current;
    setBookingsLoading(true);
    setBookingsError('');
    listMyBookings()
      .then((next) => { if (bookingLoadSequence.current === sequence) setBookings(next); })
      .catch(() => { if (bookingLoadSequence.current === sequence) setBookingsError('Check your connection and try loading your bookings again.'); })
      .finally(() => { if (bookingLoadSequence.current === sequence) setBookingsLoading(false); });
  }, []);
  useFocusEffect(useCallback(() => {
    load();
    return () => { bookingLoadSequence.current += 1; };
  }, [load]));
  useFocusEffect(useCallback(() => { void refreshOrders(); }, [refreshOrders]));
  useFocusEffect(useCallback(() => {
    orders.filter((o) => o.dbId && o.status !== 'completed' && o.status !== 'cancelled').forEach((o) => { void refreshOrderStatus(o.id); });
  }, [orders, refreshOrderStatus]));

  const cancelExp = async (b: BookingView) => {
    if (bookingActionInFlight.current) return;
    bookingActionInFlight.current = true;
    setBusy(b.id);
    try {
      const res = await cancelExperienceBooking(b.id);
      toast(res.refundedCents > 0 ? `Cancelled — ${money(res.refundedCents / 100)} refunded` : 'Booking cancelled', res.refundedCents > 0 ? 'check' : 'x', res.refundedCents > 0);
      load();
    } catch (e: any) { toast(e?.message || 'Could not cancel', 'info'); }
    finally { bookingActionInFlight.current = false; setBusy(null); }
  };
  const requestCancelExp = (b: BookingView) => {
    if (bookingActionInFlight.current) return;
    confirmAction(
      `Cancel ${b.title ?? 'this booking'}?`,
      "Your refund follows the host's cancellation policy. The booking stays active if an eligible refund cannot be confirmed.",
      () => void cancelExp(b),
      'Cancel booking',
    );
  };

  const completeRfq = async (b: BookingView) => {
    if (bookingActionInFlight.current) return;
    bookingActionInFlight.current = true;
    setBusy(b.id);
    try {
      const res = await completeBooking(b.id);
      const message = res.balanceChargePending
        ? 'Booking completed. Payment confirmation is pending. Do not pay again while we check it.'
        : res.balanceChargeError
        ? 'Booking completed. The remaining balance is still due.'
        : 'Booking marked complete';
      toast(message, res.balanceChargePending || res.balanceChargeError ? 'info' : 'check', !res.balanceChargePending && !res.balanceChargeError);
      load();
    } catch (e: any) { toast(e?.message || 'Could not complete the booking', 'info'); }
    finally { bookingActionInFlight.current = false; setBusy(null); }
  };
  const requestCompleteRfq = (b: BookingView) => {
    if (bookingActionInFlight.current) return;
    confirmAction(
      'Mark this booking complete?',
      b.balanceCents > 0
        ? `This charges the remaining ${money(b.balanceCents / 100)} balance and marks the work complete.`
        : `This marks the booking with ${b.kitchenName} complete.`,
      () => void completeRfq(b),
      'Mark complete',
    );
  };

  const cancelRfq = async (b: BookingView) => {
    if (bookingActionInFlight.current) return;
    bookingActionInFlight.current = true;
    setBusy(b.id);
    try {
      const res = await cancelBooking(b.id);
      toast(res.refunded ? 'Booking cancelled and refunded' : 'Booking cancelled', res.refunded ? 'check' : 'x', res.refunded);
      load();
    } catch (e: any) { toast(e?.message || 'Could not cancel the booking', 'info'); }
    finally { bookingActionInFlight.current = false; setBusy(null); }
  };
  const requestCancelRfq = (b: BookingView) => {
    if (bookingActionInFlight.current) return;
    confirmAction(
      `Cancel this booking with ${b.kitchenName}?`,
      'Any paid deposit must be confirmed as refunded before the cancellation completes.',
      () => void cancelRfq(b),
      'Cancel booking',
    );
  };

  const joinLink = async (b: BookingView) => {
    if (!b.experienceId) return;
    try {
      const url = await fetchExperienceMeetingUrl(b.experienceId);
      if (url) await Linking.openURL(url);
      else toast('The host hasn’t added the link yet', 'info');
    } catch { toast('Could not get the link', 'info'); }
  };

  const empty = orders.length === 0 && bookings.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 10, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <Text style={[type(28, 900), { color: c.ink, letterSpacing: -1 }]}>Orders</Text>
        <Text style={[type(13.5, 500), { color: c.soft, marginTop: 6 }]}>Your meals and bookings. Manage weekly plans in Experiences → My Plans.</Text>
      </View>

      {(bookingsLoading || ordersLoading) && orders.length === 0 && bookings.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : bookingsError && ordersError && orders.length === 0 && bookings.length === 0 ? (
        <Empty icon="info" title="Could not load your activity" body="Your meal orders and bookings could not be refreshed." action={<Btn label="Try again" icon="repeat" onPress={() => { load(); void refreshOrders(); }} />} />
      ) : empty && !bookingsError && !ordersError ? (
        <Empty icon="ticket" title="Nothing yet" body="Your meals and bookings will show up here once you order or book a cook." action={<Btn label="Browse meals" onPress={() => router.push('/discover')} />} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 760, alignSelf: 'center', width: '100%' }}>
          {bookings.length > 0 ? (
            <>
              <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }]}>Bookings</Text>
              <View style={{ gap: 10, marginBottom: 22 }}>
                {bookings.map((b) => {
                  const isExp = b.kind === 'experience';
                  const isPast = b.eventDate < new Date().toISOString().slice(0, 10);
                  const statusLabel = b.status === 'confirmed' ? (isExp ? (isPast ? 'Attended' : 'Booked') : 'Confirmed') : b.status === 'completed' ? 'Completed' : b.status === 'pending_deposit' ? 'Payment pending' : b.status;
                  const balanceLabel = isExp || b.balanceCents <= 0
                    ? ''
                    : b.balanceChargeStatus === 'paid'
                    ? ' · Balance paid'
                    : b.balanceChargeStatus === 'ambiguous' || b.balanceChargeStatus === 'charging'
                    ? ' · Payment confirmation pending'
                    : ` · ${money(b.balanceCents / 100)} due`;
                  return (
                    <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 14, ...shadow.card }}>
                      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name={isExp ? 'spark' : 'chefhat'} size={21} color={c.primary} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={[type(15, 900), { color: c.ink }]}>{isExp && b.title ? b.title : b.kitchenName}</Text>
                        <Text numberOfLines={2} style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{isExp ? `${b.kitchenName} · ` : ''}{b.eventDate} · {money(b.amountCents / 100)} · {statusLabel}{balanceLabel}</Text>
                      </View>
                      {isExp && b.status === 'confirmed' && b.locationType === 'virtual' && !isPast ? (
                        <Press scale={0.95} onPress={() => joinLink(b)} label="Join online session"><Text style={[type(12, 800), { color: c.accentText }]}>Join</Text></Press>
                      ) : isExp && b.status === 'confirmed' && isPast ? (
                        b.reviewed ? <Text style={[type(11.5, 800), { color: c.star }]}>Rated ★</Text>
                          : <Press scale={0.95} onPress={() => router.push(`/rate-experience/${b.id}`)} label="Rate experience"><Text style={[type(12, 800), { color: c.accentText }]}>Rate</Text></Press>
                      ) : isExp && b.status === 'confirmed' ? (
                        <Press scale={0.95} disabled={busy !== null} onPress={() => requestCancelExp(b)} label="Cancel booking"><Text style={[type(12, 800), { color: busy === b.id ? c.muted : c.red }]}>{busy === b.id ? '…' : 'Cancel'}</Text></Press>
                      ) : !isExp && b.status === 'confirmed' ? (
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <Press scale={0.95} disabled={busy !== null} onPress={() => requestCompleteRfq(b)} label="Mark complete"><Text style={[type(12, 800), { color: busy === b.id ? c.muted : c.accentText }]}>{busy === b.id ? '…' : 'Complete'}</Text></Press>
                          <Press scale={0.95} disabled={busy !== null} onPress={() => requestCancelRfq(b)} label="Cancel booking"><Text style={[type(11, 700), { color: busy === b.id ? c.muted : c.red }]}>Cancel</Text></Press>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

          {bookingsError ? (
            <View accessibilityRole="alert" style={{ marginBottom: 18, padding: 14, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface }}>
              <Text style={[type(13, 700), { color: c.soft, marginBottom: 10 }]}>Bookings could not be refreshed. Your meal orders are still available.</Text>
              <Btn label="Retry bookings" icon="repeat" variant="ghost" onPress={load} />
            </View>
          ) : null}

          {ordersError ? (
            <View accessibilityRole="alert" style={{ marginBottom: 18, padding: 14, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface }}>
              <Text style={[type(13, 700), { color: c.soft, marginBottom: 10 }]}>Meal orders could not be refreshed. Your bookings are still available.</Text>
              <Btn label="Retry meal orders" icon="repeat" variant="ghost" onPress={() => { void refreshOrders(); }} />
            </View>
          ) : null}

          {orders.length > 0 ? (
            <>
              <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }]}>Meal orders</Text>
              <View style={{ gap: 10 }}>
                {orders.map((o) => {
                  const cook = cookOfLine({ cook: o.cook, kitchenName: o.kitchenName, grad: o.lines[0]?.grad ?? 'g1' });
                  const s = STATUS[o.status];
                  const summary = o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ');
                  return (
                    <Press key={o.id} scale={0.99} onPress={() => router.push(`/order/${o.id}`)} label={`Open ${cook.kitchen} order, ${s.label}, ${money(o.total)}`}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 14, ...shadow.card }}>
                        <GradBox grad={cook.grad} img={thumb(o.lines[0]?.img)} style={{ width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}>
                          {o.lines[0]?.img ? null : <Text style={[type(20, 900), { color: '#fff' }]}>{cook.initial}</Text>}
                        </GradBox>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[type(15, 800), { color: c.ink }]}>{cook.kitchen}</Text>
                            <View style={{ backgroundColor: s.bg(c), paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill }}>
                              <Text style={[type(10.5, 900), { color: s.fg(c), textTransform: 'uppercase', letterSpacing: 0.3 }]}>{s.label}</Text>
                            </View>
                          </View>
                          <Text numberOfLines={1} style={[type(12.5, 500), { color: c.soft, marginTop: 3 }]}>{summary}</Text>
                          <Text style={[type(11.5, 600), { color: c.muted, marginTop: 3 }]}>{o.id} · {o.when} · Card</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <Text style={[type(15, 900), { color: c.ink }]}>{money(o.total)}</Text>
                          <Icon name="chevRight" size={16} color={c.muted} />
                        </View>
                      </View>
                    </Press>
                  );
                })}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
