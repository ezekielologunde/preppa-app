import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { svcById, COOKS, money, Quote } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Avatar, Btn } from '../../src/ui';
import { Screen, TopBar, Dock, DockTotal, Block } from '../../src/ui/layout';
import { CookRow, Burst } from '../../src/components/shared';
import { SectionHeader } from '../../src/components/cards';
import { NotFound } from '../../src/components/NotFound';

// Local status chip for the legacy (store-backed) request demo. The live services
// hub in app/(tabs)/experiences.tsx has its own real-data chip.
const _chip = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, height: 22, paddingHorizontal: 9, borderRadius: radius.pill };
function ReqStatusChip({ r }: { r: { status: string; quotes: { length: number }[] | { length: number } } }) {
  const c = useC();
  const n = Array.isArray(r.quotes) ? r.quotes.length : 0;
  if (r.status === 'booked') return <View style={[_chip, { backgroundColor: c.greenL }]}><Icon name="check" size={11} color={c.green} /><Text style={[type(10.5, 900), { color: c.green, textTransform: 'uppercase', letterSpacing: 0.4 }]}>Booked</Text></View>;
  if (r.status === 'quoted') return <View style={[_chip, { backgroundColor: c.primaryL }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary }} /><Text style={[type(10.5, 900), { color: c.primary, textTransform: 'uppercase', letterSpacing: 0.4 }]}>{n} quote{n !== 1 ? 's' : ''}</Text></View>;
  return <View style={[_chip, { backgroundColor: c.bg2 }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.soft }} /><Text style={[type(10.5, 900), { color: c.soft, textTransform: 'uppercase', letterSpacing: 0.4 }]}>Finding cooks</Text></View>;
}

export default function RequestQuotesScreen() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { requests, acceptQuote } = useStore();
  const [sel, setSel] = useState<Quote | null>(null);
  const [paid, setPaid] = useState(false);
  const r = requests.find((x) => x.id === id);
  if (!r) return <NotFound title="Request" />;
  const s = svcById(r.svc);

  // ---- stage: booked confirmation ----
  if (paid && sel) {
    const cook = COOKS[sel.cook];
    return (
      <Screen bg={c.surface}>
        <Burst
          title="You’re booked!"
          body={<><Text style={type(15, 800)}>{cook.name}</Text> is confirmed for {r.when} — <Text style={type(15, 800)}>{money(sel.amount)}</Text> agreed. We’ve opened a chat to sort out the details and payment.</>}
          actionLabel="Open chat"
          onAction={() => router.replace(`/chat/${sel.cook}`)}
          secondaryLabel="Done"
          onSecondary={() => router.back()}
        />
      </Screen>
    );
  }

  // ---- stage: confirm booking ----
  if (sel) {
    const cook = COOKS[sel.cook];
    return (
      <Screen>
        <TopBar title="Confirm booking" onBack={() => setSel(null)} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <View style={{ paddingHorizontal: 16 }}>
            <CookRow cook={sel.cook} goIcon="chat" onPress={() => router.push(`/chat/${sel.cook}`)} />
          </View>

          <Block title={r.title}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              <Fact icon="calendar" text={r.when} />
              {r.size ? <Fact icon="users" text={r.size} /> : null}
              <Fact icon="pin" text={r.loc} />
            </View>
          </Block>

          <View style={{ backgroundColor: c.surface, borderRadius: radius.card, margin: 16, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[type(15, 800), { color: c.ink }]}>{cook.name}’s fixed quote</Text>
              <Text style={[type(19, 900), { color: c.ink }]}>{money(sel.amount)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border, borderStyle: 'dashed' }}>
              <Icon name="shield" size={17} color={c.primary} />
              <Text style={[type(12.5, 600), { color: c.ink2, flex: 1, lineHeight: 18 }]}>You’ll arrange the {money(sel.amount)} directly with {cook.name}. Preppa keeps your quote fixed — in-app payments are coming soon.</Text>
            </View>
          </View>
        </ScrollView>

        <Dock>
          <DockTotal label="Agreed" value={money(sel.amount)} />
          <Btn label="Confirm booking" flex={1} onPress={() => { acceptQuote(r.id, sel); setPaid(true); }} />
        </Dock>
      </Screen>
    );
  }

  // ---- stage: request + quotes list ----
  const booked = r.status === 'booked' && r.booked ? r.booked : null;
  // Best-fit first (rating, then PrepScore) — NOT cheapest-first, which would race
  // cook pay to the bottom and drain supply. Price is shown as one attribute.
  const sorted = [...r.quotes].sort((a, b) => COOKS[b.cook].rating - COOKS[a.cook].rating || COOKS[b.cook].prepscore - COOKS[a.cook].prepscore);

  return (
    <Screen>
      <TopBar title={s?.name ?? 'Request'} sub={r.id} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Block>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Text style={[type(19, 900), { color: c.ink, letterSpacing: -0.5, flex: 1 }]}>{r.title}</Text>
            <ReqStatusChip r={r} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
            <Fact icon="calendar" text={r.when} />
            {r.size ? <Fact icon="users" text={r.size} /> : null}
            <Fact icon="tag" text={r.budget} />
          </View>
          {r.notes ? (
            <View style={{ marginTop: 12, padding: 12, backgroundColor: c.bg2, borderRadius: radius.sm }}>
              <Text style={[type(13, 500), { color: c.ink2, lineHeight: 20 }]}>“{r.notes}”</Text>
            </View>
          ) : null}
        </Block>

        {booked ? (
          <>
            <SectionHeader title="Your booking" />
            <View style={{ marginHorizontal: 16, padding: 16, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.green, borderRadius: radius.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                <Press scale={0.9} onPress={() => router.push(`/store/${booked.cook}`)}><Avatar cook={booked.cook} size={44} /></Press>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={[type(14.5, 900), { color: c.ink, letterSpacing: -0.2 }]}>{COOKS[booked.cook].name}</Text>
                    <Icon name="shield" size={14} color={c.green} />
                  </View>
                  <Text style={[type(12, 600), { color: c.soft, marginTop: 1 }]}>Confirmed · details in chat</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[type(19, 900), { color: c.ink, letterSpacing: -0.5 }]}>{money(booked.amount)}</Text>
                  <Text style={[type(10.5, 700), { color: c.muted }]}>agreed</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 9, marginTop: 12 }}>
                <Btn label="Chat" icon="chat" variant="ghost" flex={1} height={44} onPress={() => router.push(`/chat/${booked.cook}`)} />
              </View>
            </View>
          </>
        ) : r.quotes.length === 0 ? (
          <View style={{ marginHorizontal: 16, marginTop: 18, paddingVertical: 22, paddingHorizontal: 20, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border, borderStyle: 'dashed', alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon name="clock" size={24} color={c.primary} />
            </View>
            <Text style={[type(15.5, 900), { color: c.ink, letterSpacing: -0.2 }]}>Waiting for quotes</Text>
            <Text style={[type(13, 600), { color: c.soft, textAlign: 'center', marginTop: 5, lineHeight: 20, maxWidth: 250 }]}>Verified Preppas near you are reviewing your request. Fixed quotes usually land within minutes.</Text>
          </View>
        ) : (
          <>
            <SectionHeader title="Quotes" right={<Text style={[type(12.5, 700), { color: c.muted }]}>Best matches · you pick</Text>} />
            {sorted.map((q) => {
              const cook = COOKS[q.cook];
              return (
                <View key={q.cook} style={{ marginHorizontal: 16, marginBottom: 12, padding: 16, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border2, borderRadius: radius.xl }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                    <Press scale={0.9} onPress={() => router.push(`/store/${q.cook}`)}><Avatar cook={q.cook} size={44} /></Press>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Text style={[type(14.5, 900), { color: c.ink, letterSpacing: -0.2 }]}>{cook.name}</Text>
                        <Icon name="shield" size={14} color={c.green} />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                        <Icon name="star" size={11} color={c.star} />
                        <Text style={[type(12, 600), { color: c.soft }]}>{cook.rating} · PrepScore {cook.prepscore} · {cook.dist}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[type(19, 900), { color: c.ink, letterSpacing: -0.5 }]}>{money(q.amount)}</Text>
                      <Text style={[type(10.5, 700), { color: c.muted }]}>fixed</Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 11, padding: 12, backgroundColor: c.bg2, borderRadius: radius.sm }}>
                    <Text style={[type(13, 500), { color: c.ink2, lineHeight: 20 }]}>“{q.note}”</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 9, marginTop: 12 }}>
                    <Btn icon="chat" variant="ghost" height={44} onPress={() => router.push(`/chat/${q.cook}`)} />
                    <Btn label={`Accept & book · ${money(q.amount)}`} flex={1} height={44} onPress={() => setSel(q)} />
                  </View>
                </View>
              );
            })}
            <Text style={[type(12, 600), { color: c.muted, textAlign: 'center', marginHorizontal: 32, marginTop: 6, lineHeight: 18 }]}>Prices are final — each Preppa quotes once, you choose. You arrange payment directly when you book.</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Fact({ icon, text }: { icon: string; text: string }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: c.bg2 }}>
      <Icon name={icon} size={14} color={c.muted} />
      <Text style={[type(12, 700), { color: c.ink2 }]}>{text}</Text>
    </View>
  );
}

