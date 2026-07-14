import React, { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COOKS, CookId, MARKET_PLANS, STORE_SPECIALTIES, money } from '../../src/data/data';
import { useMeals, useKitchenReviews, useKitchenProfile, type KitchenProfile } from '../../src/data/hooks';
import { KITCHEN_ID } from '../../src/lib/supabase';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox, Btn } from '../../src/ui';
import { Screen } from '../../src/ui/layout';
import { HeroTopBar, HeroBtn } from '../../src/components/shared';
import { MealGrid, SectionHeader, ReviewsBlock } from '../../src/components/cards';
import { NotFound } from '../../src/components/NotFound';
import { shareAndNotify, SITE } from '../../src/lib/share';
import { FLAGS } from '../../src/config/flags';
import { openThread } from '../../src/lib/messages';
import { toggleFollow, fetchIsFollowing } from '../../src/lib/feed';
import { fetchExperiencesForKitchen, type Experience } from '../../src/lib/experiences';
import { fetchKitchenLivestream } from '../../src/lib/livestream';

const _WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const _MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A kitchen's real published experiences on its storefront (replaces the retired seed rail). */
function StoreExperiences({ kitchenId }: { kitchenId?: string }) {
  const c = useC();
  const router = useRouter();
  const [items, setItems] = React.useState<Experience[]>([]);
  React.useEffect(() => { if (kitchenId) fetchExperiencesForKitchen(kitchenId).then(setItems).catch(() => {}); }, [kitchenId]);
  if (items.length === 0) return null;
  const next = (e: Experience) => {
    const up = e.sessions.filter((s) => s.status === 'open' && new Date(s.startsAt).getTime() > Date.now()).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0];
    if (!up) return 'New dates soon';
    const d = new Date(up.startsAt); return `${_WD[d.getDay()]} ${_MO[d.getMonth()]} ${d.getDate()}`;
  };
  return (
    <>
      <SectionHeader title="Experiences" />
      {items.map((e) => (
        <Press key={e.id} scale={0.985} onPress={() => router.push(`/experience/${e.id}`)} style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.card }}>
            <GradBox grad={['#FB7185', '#E11D48']} img={e.coverUrl ?? undefined} style={{ width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>{e.coverUrl ? null : <Icon name="spark" size={22} color="#fff" />}</GradBox>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{e.title}</Text>
              <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{money((e.priceModel === 'flat' ? (e.priceCents ?? 0) : (e.perPersonCents ?? 0)) / 100)}{e.priceModel === 'flat' ? '/session' : '/person'} · {next(e)}</Text>
            </View>
            <Icon name="chevRight" size={16} color={c.muted} />
          </View>
        </Press>
      ))}
    </>
  );
}

/** Banner shown only while a kitchen is actually broadcasting — silent otherwise. */
function StoreLiveBanner({ kitchenId, cookParam }: { kitchenId?: string; cookParam: string }) {
  const c = useC();
  const router = useRouter();
  const [live, setLive] = React.useState(false);
  React.useEffect(() => {
    if (!FLAGS.live || !kitchenId) return;
    fetchKitchenLivestream(kitchenId).then((s) => setLive(s?.status === 'live')).catch(() => {});
  }, [kitchenId]);
  if (!FLAGS.live || !live) return null;
  return (
    <Press scale={0.985} onPress={() => router.push(`/store/${cookParam}/live`)} style={{ marginHorizontal: 16, marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#E11D48', borderRadius: radius.xl, padding: 16 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
        <View style={{ flex: 1 }}>
          <Text style={[type(15, 900), { color: '#fff' }]}>Live now</Text>
          <Text style={[type(12, 600), { color: 'rgba(255,255,255,.85)', marginTop: 2 }]}>Tap to watch</Text>
        </View>
        <Icon name="chevRight" size={18} color="#fff" />
      </View>
    </Press>
  );
}

/** Square "message" button — pre-sale DM to a kitchen from its storefront. */
function MsgBtn({ onPress }: { onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.94} onPress={onPress} label="Message kitchen">
      <View style={{ width: 46, height: 46, borderRadius: radius.md, backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="comment" size={20} color={c.ink2} />
      </View>
    </Press>
  );
}

export default function CookStoreScreen() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cook } = useLocalSearchParams<{ cook: string }>();
  const { toast, isMine } = useStore();
  const [following, setFollowing] = useState(false);

  const cd = COOKS[cook as CookId];
  const isSeed = !!cd; // one of the six seeded kitchens (rich seed presentation) vs a real kitchen UUID
  // Hooks run unconditionally; args differ by seed-vs-real.
  const { data: cookMeals, loading: mealsLoading } = useMeals(isSeed ? { cook: cook as CookId } : { kitchenUuid: cook });
  const { data: kitchenRevs } = useKitchenReviews(isSeed ? KITCHEN_ID[cook as CookId] : cook);
  const { data: profile, loading: profLoading } = useKitchenProfile(isSeed ? undefined : cook);

  // Hydrate real follow-state for the seed kitchens (KITCHEN_ID maps a seed id → its real UUID).
  // Placed before the early return so hook order stays stable.
  React.useEffect(() => {
    if (!isSeed) return;
    fetchIsFollowing(KITCHEN_ID[cook as CookId]).then(setFollowing).catch(() => {});
  }, [cook, isSeed]);

  // Real (non-seed) verified kitchen — render from live data.
  if (!isSeed) {
    if (profLoading) return <Screen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;
    if (!profile) return <NotFound title="Kitchen" />;
    return <RealKitchenStore profile={profile} meals={cookMeals ?? []} mealsLoading={mealsLoading} revCount={kitchenRevs?.count ?? 0} revAvg={kitchenRevs?.avg ?? 0} insetsTop={insets.top} onBack={() => router.back()} />;
  }

  const id = cook as CookId;
  const meals = cookMeals ?? [];
  const revCount = kitchenRevs?.count ?? 0;
  const revAvg = kitchenRevs?.avg ?? 0;
  const plans = MARKET_PLANS.filter((p) => p.cook === id);
  const firstName = cd.name.replace(/^Chef\s+/, '').split(' ')[0];

  const follow = async () => {
    const next = !following;
    setFollowing(next); // optimistic
    try {
      const real = await toggleFollow(KITCHEN_ID[id]);
      setFollowing(real);
      toast(real ? `Following ${cd.name} — you’ll see their posts first` : `Unfollowed ${cd.name}`, real ? 'check' : 'x', real);
    } catch { setFollowing(!next); toast('Sign in to follow kitchens', 'info'); }
  };
  const openChat = async () => {
    try { const tid = await openThread(KITCHEN_ID[id], 'store'); router.push(`/messages/${tid}`); }
    catch (e: any) { toast(e?.message || 'Could not open chat', 'info'); }
  };

  return (
    <Screen max={960}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* hero */}
        <GradBox grad={cd.grad} style={{ height: 172 }}>
          <HeroTopBar topInset={insets.top} onBack={() => router.back()} right={<HeroBtn icon="share" label={`Share ${cd.name}`} onPress={() => shareAndNotify(toast, { title: `${cd.name} on Preppa`, url: `${SITE}/store/${id}` })} />} />
          <View style={{ position: 'absolute', right: 18, bottom: 16, height: 26, paddingHorizontal: 11, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,.45)' }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.green2 }} />
            <Text style={[type(11.5, 800), { color: '#fff' }]}>Open now · closes 9 PM</Text>
          </View>
        </GradBox>

        {/* head */}
        <View style={{ backgroundColor: c.surface, paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
          <GradBox grad={cd.grad} style={{ width: 76, height: 76, borderRadius: 24, marginTop: -34, borderWidth: 4, borderColor: c.surface, alignItems: 'center', justifyContent: 'center', ...shadow.hero }}>
            <Text style={[type(28, 900), { color: '#fff' }]}>{cd.initial}</Text>
          </GradBox>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}>
            <Text style={[type(22, 900), { color: c.ink, letterSpacing: -0.8 }]}>{cd.kitchen}</Text>
            <Icon name="shield" size={17} color={c.green} />
          </View>
          <Text style={[type(13.5, 600), { color: c.soft, marginTop: 3 }]}>{cd.name} · {cd.cuisine} · {cd.dist}</Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.primaryL }}>
              <Icon name="flame" size={12} color={c.primary} />
              <Text style={[type(12, 800), { color: c.primary }]}>PrepScore {cd.prepscore}</Text>
            </View>
            {(STORE_SPECIALTIES[id] ?? []).map((t) => (
              <View key={t} style={{ height: 28, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type(12, 800), { color: c.ink2 }]}>{t}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', marginTop: 14, borderWidth: 1, borderColor: c.border2, borderRadius: radius.lg, paddingVertical: 12, backgroundColor: c.bg }}>
            <Stat><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="star" size={14} color={c.star} /><Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{revCount > 0 ? revAvg.toFixed(1) : 'New'}</Text></View><StatSub>{revCount > 0 ? `${revCount} review${revCount !== 1 ? 's' : ''}` : 'No reviews yet'}</StatSub></Stat>
            <Stat border><Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>1.2k</Text><StatSub>Followers</StatSub></Stat>
            <Stat border><Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>96%</Text><StatSub>On time</StatSub></Stat>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            {isMine(id) ? (
              <Btn label="Manage kitchen" icon="chefhat" variant="dark" block height={46} onPress={() => router.push('/my-hub')} />
            ) : (
              <>
                <View style={{ flex: 1 }}>
                  <Btn label={following ? 'Following' : 'Follow'} icon={following ? 'check' : 'plus'} variant={following ? 'ghost' : 'pri'} block height={46} onPress={follow} />
                </View>
                {FLAGS.chat ? <MsgBtn onPress={openChat} /> : null}
              </>
            )}
          </View>
        </View>

        {mealsLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : meals.length > 0 ? (
          <>
            <SectionHeader title="Meals" right={<Text style={[type(13, 700), { color: c.muted }]}>{meals.length} dish{meals.length !== 1 ? 'es' : ''}</Text>} />
            <MealGrid meals={meals} />
          </>
        ) : null}

        {FLAGS.plans && plans.length > 0 ? (
          <>
            <SectionHeader title="Weekly plans" />
            {plans.map((p) => (
              <Press key={p.id} scale={0.985} onPress={() => router.push(`/plan/${p.id}`)} style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
                  <GradBox grad={p.grad} style={{ height: 6 }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingHorizontal: 16 }}>
                    <GradBox grad={p.grad} style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={19} color="#fff" /></GradBox>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type(15.5, 900), { color: c.ink, letterSpacing: -0.3 }]}>{p.name}</Text>
                      <Text style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>{p.meals} meal{p.meals !== 1 ? 's' : ''}/wk · pause or swap anytime</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.5 }]}>{money(p.price)}</Text>
                      <Text style={[type(10.5, 700), { color: c.muted }]}>/{p.per}</Text>
                    </View>
                  </View>
                </View>
              </Press>
            ))}
          </>
        ) : null}

        <StoreExperiences kitchenId={KITCHEN_ID[id]} />

        <StoreLiveBanner kitchenId={KITCHEN_ID[id]} cookParam={id} />

        {FLAGS.feed ? (
          <Press scale={0.985} onPress={() => router.push(`/store/${id}/feed`)} style={{ marginHorizontal: 16, marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
                <Icon name="video" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>See {cd.name}'s posts</Text>
                <Text style={[type(12, 600), { color: c.soft, marginTop: 3 }]}>Behind-the-scenes from the kitchen</Text>
              </View>
              <Icon name="chevRight" size={18} color={c.muted} />
            </View>
          </Press>
        ) : null}

        <SectionHeader title="Reviews" right={revCount > 0 ? <Text style={[type(13, 800), { color: c.primary }]}>See all {revCount}</Text> : undefined} />
        <ReviewsBlock kitchenId={KITCHEN_ID[id]} />

        {FLAGS.services && !isMine(id) ? (
        <Press scale={0.985} onPress={() => router.push(`/service-request?category=cook_at_home&kitchen=${KITCHEN_ID[id]}`)} style={{ marginHorizontal: 16, marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16 }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
              <Icon name="chefhat" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>Book {firstName} for your place</Text>
              <Text style={[type(12, 600), { color: c.soft, marginTop: 3 }]}>Private dinners & events — get a fixed quote</Text>
            </View>
            <Icon name="chevRight" size={18} color={c.muted} />
          </View>
        </Press>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** Storefront for a REAL verified kitchen (live data, keyed by kitchen UUID). */
function RealKitchenStore({ profile, meals, mealsLoading, revCount, revAvg, insetsTop, onBack }: {
  profile: KitchenProfile; meals: any[]; mealsLoading: boolean; revCount: number; revAvg: number; insetsTop: number; onBack: () => void;
}) {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [following, setFollowing] = useState(false);
  React.useEffect(() => { fetchIsFollowing(profile.id).then(setFollowing).catch(() => {}); }, [profile.id]);
  const onFollow = async () => {
    const next = !following;
    setFollowing(next); // optimistic
    try {
      const real = await toggleFollow(profile.id);
      setFollowing(real);
      toast(real ? `Following ${profile.name}` : `Unfollowed ${profile.name}`, real ? 'check' : 'x', real);
    } catch { setFollowing(!next); toast('Sign in to follow kitchens', 'info'); }
  };
  const initial = profile.name.trim()[0]?.toUpperCase() ?? 'K';
  const sub = [profile.cuisine, profile.area].filter(Boolean).join(' · ');
  return (
    <Screen max={960}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <GradBox grad={['#A855F7', '#6B4A93']} img={profile.coverUrl ?? undefined} style={{ height: 172 }}>
          <HeroTopBar topInset={insetsTop} onBack={onBack} right={<HeroBtn icon="share" label={`Share ${profile.name}`} onPress={() => shareAndNotify(toast, { title: `${profile.name} on Preppa`, url: `${SITE}/store/${profile.id}` })} />} />
          {profile.availability === 'open' ? (
            <View style={{ position: 'absolute', right: 18, bottom: 16, height: 26, paddingHorizontal: 11, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,.45)' }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.green2 }} />
              <Text style={[type(11.5, 800), { color: '#fff' }]}>Open now</Text>
            </View>
          ) : null}
        </GradBox>

        <View style={{ backgroundColor: c.surface, paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
          <View style={{ width: 76, height: 76, borderRadius: 24, marginTop: -34, borderWidth: 4, borderColor: c.surface, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', ...shadow.hero }}>
            <Text style={[type(28, 900), { color: '#fff' }]}>{initial}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}>
            <Text style={[type(22, 900), { color: c.ink, letterSpacing: -0.8 }]}>{profile.name}</Text>
            <Icon name="shield" size={17} color={c.green} />
          </View>
          {sub ? <Text style={[type(13.5, 600), { color: c.soft, marginTop: 3 }]}>{sub}</Text> : null}
          {profile.bio ? <Text style={[type(13.5, 500), { color: c.ink2, marginTop: 10, lineHeight: 20 }]}>{profile.bio}</Text> : null}

          {/* Trust strip — verified identity + food safety (Stripe Connect KYC + application review) */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.greenL }}>
              <Icon name="shield" size={12} color={c.green} />
              <Text style={[type(12, 800), { color: c.green }]}>Verified prepper</Text>
            </View>
            {(profile.specialties ?? []).map((t) => (
              <View key={t} style={{ height: 28, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type(12, 800), { color: c.ink2 }]}>{t}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', marginTop: 14, borderWidth: 1, borderColor: c.border2, borderRadius: radius.lg, paddingVertical: 12, backgroundColor: c.bg }}>
            <Stat><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="star" size={14} color={c.star} /><Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{revCount > 0 ? revAvg.toFixed(1) : 'New'}</Text></View><StatSub>{revCount > 0 ? `${revCount} review${revCount !== 1 ? 's' : ''}` : 'No reviews yet'}</StatSub></Stat>
            <Stat border><Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{meals.length}</Text><StatSub>Meals</StatSub></Stat>
            {profile.yearsActive ? <Stat border><Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{profile.yearsActive}y</Text><StatSub>Cooking</StatSub></Stat> : <Stat border><Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{profile.area || '—'}</Text><StatSub>Area</StatSub></Stat>}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1 }}>
              <Btn label={following ? 'Following' : 'Follow'} icon={following ? 'check' : 'plus'} variant={following ? 'ghost' : 'pri'} block height={46}
                onPress={onFollow} />
            </View>
            {FLAGS.chat ? (
              <MsgBtn onPress={async () => {
                try { const tid = await openThread(profile.id, 'store'); router.push(`/messages/${tid}`); }
                catch (e: any) { toast(e?.message || 'Could not open chat', 'info'); }
              }} />
            ) : null}
          </View>
        </View>

        {mealsLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : meals.length > 0 ? (
          <>
            <SectionHeader title="Meals" right={<Text style={[type(13, 700), { color: c.muted }]}>{meals.length} dish{meals.length !== 1 ? 'es' : ''}</Text>} />
            <MealGrid meals={meals} />
          </>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 }}>
            <Text style={[type(14, 600), { color: c.soft, textAlign: 'center' }]}>No meals listed yet — check back soon.</Text>
          </View>
        )}

        <StoreExperiences kitchenId={profile.id} />

        <StoreLiveBanner kitchenId={profile.id} cookParam={profile.id} />

        {FLAGS.feed ? (
          <Press scale={0.985} onPress={() => router.push(`/store/${profile.id}/feed`)} style={{ marginHorizontal: 16, marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
                <Icon name="video" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>See {profile.name}'s posts</Text>
                <Text style={[type(12, 600), { color: c.soft, marginTop: 3 }]}>Behind-the-scenes from the kitchen</Text>
              </View>
              <Icon name="chevRight" size={18} color={c.muted} />
            </View>
          </Press>
        ) : null}

        <SectionHeader title="Reviews" right={revCount > 0 ? <Text style={[type(13, 800), { color: c.primary }]}>See all {revCount}</Text> : undefined} />
        <ReviewsBlock kitchenId={profile.id} />

        {FLAGS.services ? (
          <Press scale={0.985} onPress={() => router.push(`/service-request?category=cook_at_home&kitchen=${profile.id}`)} style={{ marginHorizontal: 16, marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}><Icon name="chefhat" size={22} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>Book {profile.name.split(' ')[0]} for your place</Text>
                <Text style={[type(12, 600), { color: c.soft, marginTop: 3 }]}>Private dinners & events — get a fixed quote</Text>
              </View>
              <Icon name="chevRight" size={18} color={c.muted} />
            </View>
          </Press>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Stat({ children, border }: { children: React.ReactNode; border?: boolean }) {
  const c = useC();
  return <View style={{ flex: 1, alignItems: 'center', borderLeftWidth: border ? 1 : 0, borderLeftColor: c.border2 }}>{children}</View>;
}
function StatSub({ children }: { children: React.ReactNode }) {
  const c = useC();
  return <Text style={[type(11, 700), { color: c.muted, marginTop: 2 }]}>{children}</Text>;
}
