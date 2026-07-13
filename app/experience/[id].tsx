import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { money } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox } from '../../src/ui';
import { Stepper } from '../../src/ui/primitives';
import { Screen, Dock, DockTotal, SectionLabel } from '../../src/ui/layout';
import { HeroTopBar, HeroBtn } from '../../src/components/shared';
import { NotFound } from '../../src/components/NotFound';
import { CardPaymentSheet } from '../../src/components/CardPaymentSheet';
import { shareAndNotify, SITE } from '../../src/lib/share';
import { FLAGS } from '../../src/config/flags';
import { openThread } from '../../src/lib/messages';
import { fetchExperience, fetchAvailability, bookExperience, fetchMyWaitlistSessions, joinWaitlist, leaveWaitlist, fetchExperienceRating, fetchExperienceReviews, type Experience, type Availability, type ExperienceReview } from '../../src/lib/experiences';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_LABEL: Record<string, string> = { class: 'Cooking class', supper_club: 'Supper club', tasting: 'Tasting', workshop: 'Workshop' };
const POLICY_LABEL: Record<string, string> = {
  flexible: 'Free cancellation up to 24h before — contact the host.',
  standard: 'Free cancellation up to 48h before — contact the host.',
  strict: 'Non-refundable. Contact the host if the cook cancels.',
};
const LOCATION_LABEL: Record<string, string> = { prepper_place: 'Hosted at the cook’s kitchen', customer_place: 'At your place', venue: 'At a venue', virtual: 'Online' };
function fmtChip(iso: string) { const d = new Date(iso); return { day: `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}`, time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }; }

export default function ExperienceDetail() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useStore();

  const [exp, setExp] = useState<Experience | null>(null);
  const [avail, setAvail] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selSession, setSelSession] = useState<string | null>(null);
  const [guests, setGuests] = useState(1);
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState<{ clientSecret: string; label: string } | null>(null);
  const [waitlisted, setWaitlisted] = useState<Set<string>>(new Set());
  const [rating, setRating] = useState({ avg: 0, count: 0 });
  const [reviews, setReviews] = useState<ExperienceReview[]>([]);

  const loadAvail = async (expId: string) => {
    const a = await fetchAvailability(expId);
    setAvail(a);
    try { setWaitlisted(new Set(await fetchMyWaitlistSessions(a.map((s) => s.sessionId)))); } catch { /* signed-out */ }
  };
  useEffect(() => {
    (async () => {
      const e = await fetchExperience(id!);
      if (!e) { setNotFound(true); setLoading(false); return; }
      setExp(e); setGuests(e.minGuests);
      fetchExperienceRating(e.id).then(setRating).catch(() => {});
      fetchExperienceReviews(e.id).then(setReviews).catch(() => {});
      await loadAvail(e.id); setLoading(false);
    })();
  }, [id]);

  // bookable sessions = open, in the future, seats left
  const sessions = useMemo(() => avail.filter((s) => s.status === 'open' && new Date(s.startsAt).getTime() > Date.now()), [avail]);
  const sel = sessions.find((s) => s.sessionId === selSession) ?? null;
  // when a session has seats, clamp to what's left; a sold-out session (waitlist) allows up to max
  const maxGuests = exp ? (sel && sel.seatsLeft > 0 ? Math.min(exp.maxGuests, sel.seatsLeft) : exp.maxGuests) : 1;
  useEffect(() => { if (exp) setGuests((g) => Math.max(exp.minGuests, Math.min(g, Math.max(exp.minGuests, maxGuests)))); }, [selSession, maxGuests, exp]);

  if (notFound) return <NotFound title="Experience" />;
  if (loading || !exp) return <Screen bg={c.surface}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;

  const per = exp.perPersonCents ?? 0;
  const total = per * guests;
  const canBook = !!sel && sel.seatsLeft >= guests && guests >= exp.minGuests;

  const book = async () => {
    if (!sel || busy) return;
    setBusy(true);
    try {
      const res = await bookExperience(exp.id, sel.sessionId, guests);
      if (res.clientSecret) setPay({ clientSecret: res.clientSecret, label: money(res.amountCents / 100) });
      else { toast('You’re booked!', 'check', true); router.replace('/orders'); }
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/unauthorized|auth/i.test(msg)) toast('Sign in to book this experience', 'info');
      else if (/full|no longer|unavailable/i.test(msg)) { toast('That session just changed — pick another', 'info'); await loadAvail(exp.id); setSelSession(null); }
      else toast(msg || 'Couldn’t start your booking', 'info');
    } finally { setBusy(false); }
  };

  const onWait = !!sel && waitlisted.has(sel.sessionId);
  const joinWl = async () => {
    if (!sel) return;
    try { await joinWaitlist(sel.sessionId, guests); setWaitlisted((w) => new Set(w).add(sel.sessionId)); toast('You’re on the waitlist — we’ll ping you if a seat opens', 'check', true); }
    catch (e: any) { toast(/auth/i.test(String(e?.message)) ? 'Sign in to join the waitlist' : (e?.message || 'Could not join'), 'info'); }
  };
  const leaveWl = async () => {
    if (!sel) return;
    try { await leaveWaitlist(sel.sessionId); setWaitlisted((w) => { const n = new Set(w); n.delete(sel.sessionId); return n; }); toast('Left the waitlist', 'x'); }
    catch (e: any) { toast(e?.message || 'Could not update', 'info'); }
  };
  const primaryAction = !sel ? undefined : canBook ? book : onWait ? leaveWl : joinWl;
  const primaryLabel = !sel ? 'Pick a date' : canBook ? `Book · ${money(total / 100)}` : onWait ? 'On the waitlist' : 'Join waitlist';
  const primaryIcon = canBook ? 'ticket' : onWait ? 'check' : 'bell';

  const initial = exp.kitchenName.trim()[0]?.toUpperCase() ?? 'K';
  const messageHost = async () => {
    try { const tid = await openThread(exp.kitchenId, 'experience', exp.id); router.push(`/messages/${tid}`); }
    catch (e: any) { toast(/auth/i.test(String(e?.message)) ? 'Sign in to message the host' : (e?.message || 'Could not open chat'), 'info'); }
  };

  return (
    <Screen bg={c.surface}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <GradBox grad={['#FB7185', '#E11D48']} img={exp.coverUrl ?? undefined} style={{ height: 240 }}>
          <HeroTopBar topInset={insets.top} onBack={() => router.back()} right={<HeroBtn icon="share" onPress={() => shareAndNotify(toast, { title: exp.title, url: `${SITE}/experience/${exp.id}` })} />} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 34, left: 18, height: 24, borderRadius: radius.pill, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,.45)' }}>
            <Icon name="spark" size={11} color="#fff" />
            <Text style={[type(10, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 }]}>{TYPE_LABEL[exp.experienceType] ?? 'Experience'}</Text>
          </View>
        </GradBox>

        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -26, padding: 18, paddingTop: 22 }}>
          <Text style={[type(23, 900), { color: c.ink, letterSpacing: -0.8, lineHeight: 27 }]}>{exp.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
            <Meta ico="clock" text={`${exp.durationMin} min`} />
            <Meta ico="users" text={`${exp.minGuests}–${exp.maxGuests} guests`} />
            <Meta ico="chefhat" text={LOCATION_LABEL[exp.locationType] ?? 'Hosted'} />
            {rating.count > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="star" size={14} color={c.star} /><Text style={[type(13, 800), { color: c.ink }]}>{rating.avg.toFixed(1)}</Text><Text style={[type(12.5, 600), { color: c.soft }]}>({rating.count})</Text></View> : null}
          </View>

          <Press scale={0.98} onPress={() => router.push(`/store/${exp.kitchenId}`)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, padding: 13, borderRadius: radius.lg, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}>
              <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={[type(19, 900), { color: '#fff' }]}>{initial}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={[type(15, 900), { color: c.ink }]}>Hosted by {exp.kitchenName}</Text><Icon name="shield" size={15} color={c.green} /></View>
                <Text style={[type(12, 600), { color: c.soft, marginTop: 2 }]}>Verified kitchen</Text>
              </View>
              <Icon name="chevRight" size={16} color={c.soft} />
            </View>
          </Press>

          {FLAGS.chat ? (
            <Press scale={0.98} onPress={messageHost} style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.border2, backgroundColor: c.bg2 }}>
                <Icon name="comment" size={17} color={c.ink2} />
                <Text style={[type(13.5, 800), { color: c.ink2 }]}>Message the host</Text>
              </View>
            </Press>
          ) : null}

          {exp.description ? (<><SectionLabel>About this experience</SectionLabel><Text style={[type(14.5, 500), { color: c.soft, lineHeight: 23 }]}>{exp.description}</Text></>) : null}

          {/* Pick a session */}
          <SectionLabel>Pick a date</SectionLabel>
          {sessions.length === 0 ? (
            <Text style={[type(13.5, 600), { color: c.muted, lineHeight: 20 }]}>No upcoming sessions right now — check back soon.</Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
                {avail.filter((s) => s.status === 'open' && new Date(s.startsAt).getTime() > Date.now()).map((s) => {
                  const on = s.sessionId === selSession;
                  const sold = s.seatsLeft <= 0;
                  const f = fmtChip(s.startsAt);
                  return (
                    <Press key={s.sessionId} scale={0.96} onPress={() => setSelSession(s.sessionId)}>
                      <View style={{ minWidth: 120, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: on ? c.primary : c.bg2, borderWidth: 1.5, borderColor: on ? c.primary : c.border, opacity: sold && !on ? 0.72 : 1 }}>
                        <Text style={[type(13.5, 900), { color: on ? '#fff' : c.ink }]}>{f.day}</Text>
                        <Text style={[type(12, 700), { color: on ? 'rgba(255,255,255,.85)' : c.soft, marginTop: 2 }]}>{f.time}</Text>
                        <Text style={[type(11, 800), { color: sold ? c.red : on ? 'rgba(255,255,255,.85)' : c.green, marginTop: 5 }]}>{sold ? 'Sold out' : `${s.seatsLeft} left`}</Text>
                      </View>
                    </Press>
                  );
                })}
              </ScrollView>
              <Text style={[type(11, 600), { color: c.muted, marginTop: 8 }]}>Times shown in your local time.</Text>
              {sel ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                  <Text style={[type(14.5, 800), { color: c.ink }]}>Guests</Text>
                  <Stepper value={guests} onDec={() => setGuests((g) => Math.max(exp.minGuests, g - 1))} onInc={() => setGuests((g) => Math.min(maxGuests, g + 1))} />
                </View>
              ) : null}
              {sel && sel.seatsLeft <= 0 ? <Text style={[type(11.5, 600), { color: c.ink2, marginTop: 6 }]}>This session is full — join the waitlist and we’ll notify you if a seat opens.</Text>
                : sel && sel.seatsLeft < exp.maxGuests ? <Text style={[type(11.5, 600), { color: c.muted, marginTop: 6 }]}>Only {sel.seatsLeft} seat{sel.seatsLeft !== 1 ? 's' : ''} left for this session.</Text> : null}
            </>
          )}

          {exp.whatsIncluded.length ? (
            <><SectionLabel>What’s included</SectionLabel>
              {exp.whatsIncluded.map((it, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={13} color="#fff" /></View>
                  <Text style={[type(14, 700), { color: c.ink, flex: 1 }]}>{it}</Text>
                </View>
              ))}</>
          ) : null}

          {exp.requirements ? (<><SectionLabel>Good to know</SectionLabel><Text style={[type(14, 500), { color: c.soft, lineHeight: 21 }]}>{exp.requirements}</Text></>) : null}
          {exp.allergens.length ? <Text style={[type(12.5, 700), { color: c.red, marginTop: 12 }]}>Allergens: {exp.allergens.join(', ')}</Text> : null}

          <SectionLabel>Cancellation</SectionLabel>
          <Text style={[type(13.5, 600), { color: c.soft, lineHeight: 20 }]}>{POLICY_LABEL[exp.cancellationPolicy] ?? POLICY_LABEL.strict}</Text>

          {reviews.length > 0 ? (
            <>
              <SectionLabel>Reviews {rating.count > 0 ? `· ${rating.avg.toFixed(1)} ★` : ''}</SectionLabel>
              {reviews.map((rv, i) => (
                <View key={i} style={{ paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: c.border2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 2 }}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={13} color={n <= rv.rating ? c.star : c.border} />)}</View>
                    <Text style={[type(12.5, 800), { color: c.ink }]}>{rv.author}</Text>
                  </View>
                  {rv.body ? <Text style={[type(13.5, 500), { color: c.soft, marginTop: 5, lineHeight: 20 }]}>{rv.body}</Text> : null}
                </View>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>

      <Dock>
        <DockTotal label={canBook ? `${guests} × ${money(per / 100)}` : 'Per person'} value={money((canBook ? total : per) / 100)} />
        <Press scale={0.98} onPress={sel && !busy ? primaryAction : undefined} style={{ flex: 1 }}>
          <View style={{ height: 50, borderRadius: radius.md, backgroundColor: !sel ? c.border : onWait ? c.bg2 : c.primary, borderWidth: onWait ? 1.5 : 0, borderColor: c.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: busy ? 0.7 : 1 }}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <><Icon name={primaryIcon} size={18} color={onWait ? c.primary : '#fff'} /><Text style={[type(15, 900), { color: onWait ? c.primary : '#fff' }]}>{primaryLabel}</Text></>}
          </View>
        </Press>
      </Dock>

      <CardPaymentSheet visible={!!pay} clientSecret={pay?.clientSecret ?? null} amountLabel={pay?.label ?? ''} mode="pay"
        onPaid={() => { setPay(null); toast('You’re booked! 🎉', 'check', true); router.replace('/orders'); }} onClose={() => setPay(null)} />
    </Screen>
  );
}

function Meta({ ico, text }: { ico: string; text: string }) {
  const c = useC();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name={ico} size={15} color={c.soft} /><Text style={[type(13, 700), { color: c.ink2 }]}>{text}</Text></View>;
}
