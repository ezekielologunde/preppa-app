import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Animated, StyleSheet, LayoutChangeEvent, StyleProp, ViewStyle, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { COOKS, CookId, Meal, Experience, PlanGoal, money, cookOf, thumb } from '../data/data';
import { useKitchenReviews, type KitchenCard } from '../data/hooks';
import { seedCookForKitchen } from '../data/supabaseRepository';
import { useC } from '../theme/ThemeContext';
import { type, radius, shadow } from '../theme/theme';
import { useActions, useFav } from '../store/store';
import { Press, GradBox, Icon, Avatar, Stars, GradAvatar } from '../ui';
import { useReducedMotion } from '../ui/useReducedMotion';

/**
 * Whole-card press-scale for the "navigation layer" pattern. The card wraps its
 * visual content in the returned Animated.View while a sibling absolute-fill
 * Pressable drives the scale via onPressIn/onPressOut — so action buttons
 * (heart, quick-add, CTA) can sit as DOM siblings of the nav layer instead of
 * nested inside it (which renders an invalid <button> inside <button> on web).
 */
function useCardScale(scale = 0.97) {
  const a = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const to = (v: number) => {
    if (reduced) { a.setValue(1); return; }
    Animated.spring(a, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return {
    scaleStyle: { transform: [{ scale: a }] },
    onPressIn: () => to(scale),
    onPressOut: () => to(1),
  };
}

/** Green verification check (.vchk). */
export function VChk({ size = 13, color }: { size?: number; color?: string }) {
  const c = useC();
  return <Icon name="shield" size={size} color={color ?? c.green} />;
}

/** Horizontal rail of cook/kitchen cards — shared by Home and Experiences. */
export function CookRail({ cooks }: { cooks: CookId[] }) {
  const c = useC();
  const router = useRouter();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingVertical: 4 }}>
      {cooks.map((id) => {
        const cook = COOKS[id];
        return (
          <Press key={id} scale={0.97} onPress={() => router.push(`/store/${id}`)} label={`${cook.name}'s kitchen`}>
            <View style={{ width: 150, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, padding: 14, alignItems: 'center', ...shadow.card }}>
              <Avatar cook={id} size={54} rad={17} />
              <Text numberOfLines={1} style={[type(14, 900), { color: c.ink, marginTop: 10 }]}>{cook.name}</Text>
              <Text numberOfLines={1} style={[type(11.5, 600), { color: c.soft, marginTop: 2 }]}>{cook.cuisine}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Icon name="star" size={12} color={c.star} />
                <Text style={[type(11.5, 800), { color: c.ink }]}>New · {cook.dist}</Text>
              </View>
            </View>
          </Press>
        );
      })}
    </ScrollView>
  );
}

/** Horizontal rail of REAL verified kitchens (from the directory). Keeps the rich seed
 *  presentation for the six seeded kitchens; real preppers render from live data. */
export function PrepperRail({ kitchens }: { kitchens: KitchenCard[] }) {
  const c = useC();
  const router = useRouter();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingVertical: 4 }}>
      {kitchens.map((k) => {
        const seed = seedCookForKitchen(k.id); // rich seed presentation for the seeded six
        const cook = seed ? COOKS[seed] : null;
        const name = cook?.name ?? k.name;
        const cuisine = cook?.cuisine ?? k.cuisine;
        const distTxt = k.dist || cook?.dist || k.area;
        const rating = k.ratingCount > 0 ? k.ratingAvg.toFixed(1) : 'New';
        return (
          <Press key={k.id} scale={0.97} onPress={() => router.push(`/store/${seed ?? k.id}`)} label={`${name} kitchen`}>
            <View style={{ width: 150, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, padding: 14, alignItems: 'center', ...shadow.card }}>
              {seed ? <Avatar cook={seed} size={54} rad={17} /> : (
                <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[type(22, 900), { color: '#fff' }]}>{name.trim()[0]?.toUpperCase() ?? 'K'}</Text>
                </View>
              )}
              <Text numberOfLines={1} style={[type(14, 900), { color: c.ink, marginTop: 10 }]}>{name}</Text>
              <Text numberOfLines={1} style={[type(11.5, 600), { color: c.soft, marginTop: 2 }]}>{cuisine}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Icon name="star" size={12} color={c.star} />
                <Text style={[type(11.5, 800), { color: c.ink }]}>{rating}{distTxt ? ` · ${distTxt}` : ''}</Text>
              </View>
            </View>
          </Press>
        );
      })}
    </ScrollView>
  );
}

/** A plausible star distribution derived from an aggregate rating (illustrative). */
function ratingBars(r: number): { star: number; pct: number }[] {
  const base = r >= 4.85 ? [88, 9, 2, 1, 0] : r >= 4.7 ? [78, 15, 4, 2, 1] : [66, 22, 7, 3, 2];
  return [5, 4, 3, 2, 1].map((star, i) => ({ star, pct: base[i] }));
}

/** Ratings breakdown + review cards — shared by cook storefront and meal detail. */
/** Reviews for a kitchen, from the real `reviews` table. Empty until buyers review. */
export function ReviewsBlock({ kitchenId }: { kitchenId?: string }) {
  const c = useC();
  const { data, loading } = useKitchenReviews(kitchenId);
  const reviews = data?.reviews ?? [];
  const count = data?.count ?? 0;
  const avg = data?.avg ?? 0;

  if (loading) {
    return <View style={{ paddingVertical: 28, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>;
  }
  if (count === 0) {
    return (
      <View style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 14, padding: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, alignItems: 'center' }}>
        <Stars n={0} size={15} />
        <Text style={[type(15, 900), { color: c.ink, marginTop: 10 }]}>No reviews yet</Text>
        <Text style={[type(13, 500), { color: c.soft, textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 260 }]}>Be the first to review this kitchen once your order is complete.</Text>
      </View>
    );
  }
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 20, marginHorizontal: 16, marginTop: 4, marginBottom: 14, alignItems: 'center' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type(38, 900), { color: c.ink, letterSpacing: -1.5 }]}>{avg.toFixed(1)}</Text>
          <Stars n={Math.round(avg)} size={13} />
          <Text style={[type(11.5, 600), { color: c.muted, marginTop: 4 }]}>{count} review{count !== 1 ? 's' : ''}</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          {ratingBars(avg).map((d) => (
            <View key={d.star} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[type(11, 700), { color: c.soft, width: 9 }]}>{d.star}</Text>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.bg2, overflow: 'hidden' }}>
                <View style={{ width: `${d.pct}%`, height: 6, borderRadius: 3, backgroundColor: c.star }} />
              </View>
            </View>
          ))}
        </View>
      </View>
      {reviews.map((rv) => (
        <View key={rv.id} style={{ marginHorizontal: 16, marginBottom: 10, padding: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <GradAvatar grad="g2" letter="P" size={36} rad={12} />
            <View style={{ flex: 1 }}>
              <Text style={[type(14, 800), { color: c.ink }]}>Preppa buyer</Text>
              <Text style={[type(11.5, 600), { color: c.muted, marginTop: 1 }]}>{new Date(rv.created_at).toLocaleDateString()}</Text>
            </View>
            <Stars n={rv.rating} size={13} />
          </View>
          {rv.body ? <Text style={[type(13.5, 500), { color: c.ink2, marginTop: 10, lineHeight: 20 }]}>{rv.body}</Text> : null}
        </View>
      ))}
    </>
  );
}

/** Cut / Bulk / Maintain pill for goal-based meal plans. */
export function GoalBadge({ goal, size = 'sm' }: { goal: PlanGoal; size?: 'sm' | 'md' }) {
  const c = useC();
  // `goal` is free text on real plans (fed via `as any`) — render nothing for values
  // outside the known set rather than crashing on `meta.color`.
  const meta = ({ cut: { label: 'Cut', color: c.green }, bulk: { label: 'Bulk', color: c.primary }, maintain: { label: 'Maintain', color: c.purple } } as Record<string, { label: string; color: string }>)[goal];
  if (!meta) return null;
  const md = size === 'md';
  return (
    <View style={{ height: md ? 26 : 22, paddingHorizontal: md ? 12 : 10, borderRadius: radius.pill, backgroundColor: meta.color, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
      {md ? <Icon name="bolt" size={12} color="#fff" /> : null}
      <Text style={[type(md ? 11 : 10, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 }]}>{meta.label}</Text>
    </View>
  );
}

/** Section header row (h3 + optional "See all"). */
export function SectionHeader({ title, action, onAction, right }: { title: string; action?: string; onAction?: () => void; right?: React.ReactNode }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 30, paddingBottom: 14 }}>
      <Text style={[type(20, 900), { color: c.ink, letterSpacing: -0.7 }]}>{title}</Text>
      {right ?? (action ? (
        <Press scale={0.95} onPress={onAction}>
          <Text style={[type(14, 800), { color: c.primary }]}>{action}</Text>
        </Press>
      ) : null)}
    </View>
  );
}

/** Responsive column count from a measured width (2 phone / 3 tablet / 4 desktop). */
export function useColumns(width: number) {
  if (width >= 1000) return 4;
  if (width >= 700) return 3;
  return 2;
}

/** Responsive meal grid (2 col phone, 3 tablet, 4 desktop). Measures a
 *  padding-free inner row so cards fill exactly and never over-wrap. */
export function MealGrid({ meals, showMatch, px = 20 }: { meals: Meal[]; showMatch?: boolean; px?: number }) {
  const [w, setW] = useState(0);
  const cols = useColumns(w);
  const gap = 14;
  const cardW = w > 0 ? (w - gap * (cols - 1)) / cols : 0;
  return (
    <View style={{ paddingHorizontal: px }}>
      <View
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}
      >
        {w > 0 && meals.map((m) => <MealCardLg key={m.id} m={m} showMatch={showMatch} width={cardW} />)}
      </View>
    </View>
  );
}

export const MealCardLg = React.memo(function MealCardLg({ m, showMatch, width }: { m: Meal; showMatch?: boolean; width?: number }) {
  const c = useC();
  const router = useRouter();
  const { fav } = useFav();
  const { toggleFav, addToCart, showFlash, isMine } = useActions();
  const cook = cookOf(m);
  const isFav = fav.has(m.id);
  const mine = isMine(m.cook);
  const quickAdd = () => {
    addToCart({ key: m.id, name: m.name, cook: m.cook, price: m.price, grad: m.grad, mealUuid: m.mealUuid, kitchenUuid: m.kitchenUuid }, 1);
    showFlash({ name: m.name, grad: m.grad });
  };
  const press = useCardScale(0.97);
  return (
    <View style={{ width }}>
      {/* Visual content — non-interactive; scales with the nav layer's press. */}
      <Animated.View style={press.scaleStyle}>
        <View style={{ backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, overflow: 'hidden', ...shadow.card }}>
          <GradBox grad={m.grad} img={thumb(m.img)} style={{ height: 150 }}>
            {showMatch && m.match ? (
              <View style={{ position: 'absolute', top: 8, left: 8, height: 22, borderRadius: radius.pill, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.green }}>
                <Icon name="check" size={11} color="#fff" />
                <Text style={[type(10, 900), { color: '#fff', textTransform: 'uppercase' }]}>Match</Text>
              </View>
            ) : null}
            {mine ? (
              <View style={{ position: 'absolute', bottom: 9, right: 9, height: 22, borderRadius: radius.pill, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,.92)', ...shadow.soft }}>
                <Icon name="chefhat" size={12} color={c.ink} />
                <Text style={[type(10, 900), { color: c.ink, textTransform: 'uppercase' }]}>Yours</Text>
              </View>
            ) : null}
          </GradBox>
          <View style={{ padding: 12 }}>
            <Text numberOfLines={2} style={[type(15, 800), { color: c.ink, letterSpacing: -0.2 }]}>{m.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 }}>
              <GradBox grad={cook.grad} style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type(11, 900), { color: '#fff' }]}>{cook.initial}</Text>
              </GradBox>
              <Text numberOfLines={1} style={[type(12, 700), { color: c.soft, flex: 1 }]}>{cook.name}</Text>
              <VChk />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <Text style={[type(17, 900), { color: c.primary }]}>{money(m.price)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="star" size={13} color={c.star} />
                <Text style={[type(12.5, 800), { color: c.ink }]}>{m.reviews > 0 ? m.rating : 'New'} · {m.time}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
              <Icon name="bolt" size={12} color={c.soft} />
              <Text style={[type(11.5, 700), { color: c.soft }]}>{m.protein}g protein · {m.kcal} cal</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Navigation layer — a sibling of the action buttons, so no button nests another. */}
      <Pressable
        onPress={() => router.push(`/meal/${m.id}`)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={m.name}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ position: 'absolute', top: 8, right: 8 }}>
        <Press scale={0.85} onPress={() => toggleFav(m.id)} label={isFav ? `Remove ${m.name} from favorites` : `Save ${m.name} to favorites`} hitSlop={8}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
            <Icon name={isFav ? 'heartFill' : 'heart'} size={15} color={isFav ? c.primary : c.soft} />
          </View>
        </Press>
      </View>
      {!mine ? (
        <View style={{ position: 'absolute', top: 107, right: 9 }}>
          <Press scale={0.85} onPress={quickAdd} label={`Quick add ${m.name} to cart`} hitSlop={8}>
            <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
              <Icon name="plus" size={18} color="#fff" />
            </View>
          </Press>
        </View>
      ) : null}
    </View>
  );
});

/** Today's drop — the calm white hero card on Home. */
export const HeroDrop = React.memo(function HeroDrop({ m }: { m: Meal }) {
  const c = useC();
  const router = useRouter();
  const { fav } = useFav();
  const { toggleFav, addToCart, showFlash, isMine } = useActions();
  const cook = cookOf(m);
  const isFav = fav.has(m.id);
  const mine = isMine(m.cook);
  const add = () => {
    addToCart({ key: m.id, name: m.name, cook: m.cook, price: m.price, grad: m.grad, mealUuid: m.mealUuid, kitchenUuid: m.kitchenUuid }, 1);
    showFlash({ name: m.name, grad: m.grad });
  };
  const press = useCardScale(0.985);
  const goMeal = () => router.push(`/meal/${m.id}`);
  return (
    <Animated.View style={[{ marginHorizontal: 20 }, press.scaleStyle]}>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.hero, overflow: 'hidden', ...shadow.card }}>
        <GradBox grad={m.grad} img={m.img} style={{ height: 210 }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: 14, left: 14, height: 30, borderRadius: radius.pill, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,.94)' }}>
            <Icon name="bolt" size={13} color={c.primary} />
            <Text style={[type(11, 900), { color: c.ink, textTransform: 'uppercase' }]}>Today’s drop</Text>
          </View>
          {/* Nav layer over the photo — sibling of the heart, so no nested <button>. */}
          <Pressable onPress={goMeal} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={m.name} style={StyleSheet.absoluteFill} />
          <View style={{ position: 'absolute', top: 13, right: 13 }}>
            <Press scale={0.85} onPress={() => toggleFav(m.id)} label={isFav ? `Remove ${m.name} from favorites` : `Save ${m.name} to favorites`} hitSlop={8}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <Icon name={isFav ? 'heartFill' : 'heart'} size={15} color={isFav ? c.primary : c.soft} />
              </View>
            </Press>
          </View>
        </GradBox>
        <View style={{ padding: 18 }}>
          {/* Text block is its own nav button (sibling of the CTA below). */}
          <Press scale={0.995} onPress={goMeal} label={m.name}>
            <Text style={[type(21, 900), { color: c.ink, letterSpacing: -0.6 }]}>{m.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <GradBox grad={cook.grad} style={{ width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type(12, 900), { color: '#fff' }]}>{cook.initial}</Text>
              </GradBox>
              <Text style={[type(13.5, 700), { color: c.soft }]}>{cook.kitchen}</Text>
              <VChk />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
              <Meta icon="star" text={m.reviews > 0 ? String(m.rating) : 'New'} starColor />
              <Meta icon="bolt" text={`${m.protein}g protein`} />
              <Meta icon="walk" text={m.dist} />
              <Meta icon="clock" text={m.time} />
            </View>
          </Press>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
            <Text style={[type(23, 900), { color: c.primary }]}>{money(m.price)}</Text>
            {mine ? (
              <Press scale={0.94} onPress={() => router.push('/hub/menu')}>
                <View style={{ height: 46, borderRadius: radius.pill, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.bg2 }}>
                  <Icon name="chefhat" size={16} color={c.ink} />
                  <Text style={[type(15, 800), { color: c.ink }]}>Your listing</Text>
                </View>
              </Press>
            ) : (
            <Press scale={0.94} onPress={add}>
              <View style={{ height: 46, borderRadius: radius.pill, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.primary, ...shadow.brand }}>
                <Icon name="plus" size={17} color="#fff" />
                <Text style={[type(15, 800), { color: '#fff' }]}>Add to bag</Text>
              </View>
            </Press>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
});

function Meta({ icon, text, starColor }: { icon: string; text: string; starColor?: boolean }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Icon name={icon} size={14} color={starColor ? c.star : c.soft} />
      <Text style={[type(13, 700), { color: c.soft }]}>{text}</Text>
    </View>
  );
}

/** Horizontal experience rail. */
export function ExpRail({ exps, wrap }: { exps: Experience[]; wrap?: boolean }) {
  if (wrap) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 13, paddingHorizontal: 20 }}>
        {exps.map((e) => <ExpCard key={e.id} e={e} />)}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 13, paddingHorizontal: 20, paddingVertical: 6 }}>
      {exps.map((e) => <ExpCard key={e.id} e={e} />)}
    </ScrollView>
  );
}

export const ExpCard = React.memo(function ExpCard({ e, style }: { e: Experience; style?: StyleProp<ViewStyle> }) {
  const c = useC();
  const router = useRouter();
  const cook = COOKS[e.cook];
  return (
    <Press scale={0.97} onPress={() => router.push(`/experience/${e.id}`)} style={[{ width: 236 }, style]}>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, overflow: 'hidden', ...shadow.card }}>
        <GradBox grad={e.grad} img={e.img} style={{ height: 132 }}>
          <View style={{ position: 'absolute', top: 10, left: 10, height: 26, borderRadius: radius.pill, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,.92)' }}>
            <Icon name={e.ico} size={13} color={c.primary} />
            <Text style={[type(10.5, 900), { color: c.ink, textTransform: 'uppercase' }]}>{e.tag}</Text>
          </View>
          <View style={{ position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <GradBox grad={cook.grad} style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' }}>
              <Text style={[type(11, 900), { color: '#fff' }]}>{cook.initial}</Text>
            </GradBox>
            <Text style={[type(12, 800), { color: '#fff' }]}>{cook.name}</Text>
          </View>
        </GradBox>
        <View style={{ padding: 13 }}>
          <Text style={[type(15, 900), { color: c.ink }]}>{e.title}</Text>
          <Text numberOfLines={1} style={[type(12, 600), { color: c.soft, marginTop: 2 }]}>{e.sub}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Icon name="calendar" size={13} color={c.primary} />
            <Text style={[type(11.5, 700), { color: c.ink2 }]}>{e.when}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={[type(15, 900), { color: c.ink }]}>{money(e.price)}<Text style={type(11, 700)}> /seat</Text></Text>
            <Text style={[type(11, 800), { color: c.primary, backgroundColor: c.primaryL, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' }]}>{e.spots}</Text>
          </View>
        </View>
      </View>
    </Press>
  );
});
