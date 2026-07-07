import React, { useState } from 'react';
import { View, Text, ScrollView, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { COOKS, MEALS, mealById, Meal, Experience, money } from '../data/data';
import { useC } from '../theme/ThemeContext';
import { type, radius, shadow } from '../theme/theme';
import { useStore } from '../store/store';
import { Press, GradBox, Icon } from '../ui';

/** Green verification check (.vchk). */
export function VChk({ size = 13, color }: { size?: number; color?: string }) {
  const c = useC();
  return <Icon name="shield" size={size} color={color ?? c.green} />;
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
  const { fav, toggleFav, addToCart, showFlash, isMine } = useStore();
  const cook = COOKS[m.cook];
  const isFav = fav.has(m.id);
  const mine = isMine(m.cook);
  const quickAdd = () => {
    addToCart({ key: m.id, name: m.name, cook: m.cook, price: m.price, grad: m.grad }, 1);
    showFlash({ name: m.name, grad: m.grad });
  };
  return (
    <Press scale={0.97} onPress={() => router.push(`/meal/${m.id}`)} style={{ width }}>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, overflow: 'hidden', ...shadow.card }}>
        <GradBox grad={m.grad} img={m.img} style={{ height: 150 }}>
          {showMatch && m.match ? (
            <View style={{ position: 'absolute', top: 8, left: 8, height: 22, borderRadius: radius.pill, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.green }}>
              <Icon name="check" size={11} color="#fff" />
              <Text style={[type(10, 900), { color: '#fff', textTransform: 'uppercase' }]}>Match</Text>
            </View>
          ) : null}
          <Press scale={0.85} onPress={() => toggleFav(m.id)} label={isFav ? `Remove ${m.name} from favorites` : `Save ${m.name} to favorites`} style={{ position: 'absolute', top: 8, right: 8 }} hitSlop={8}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
              <Icon name={isFav ? 'heartFill' : 'heart'} size={15} color={isFav ? c.primary : c.soft} />
            </View>
          </Press>
          {mine ? (
            <View style={{ position: 'absolute', bottom: 9, right: 9, height: 22, borderRadius: radius.pill, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,.92)', ...shadow.soft }}>
              <Icon name="chefhat" size={12} color={c.ink} />
              <Text style={[type(10, 900), { color: c.ink, textTransform: 'uppercase' }]}>Yours</Text>
            </View>
          ) : (
          <Press scale={0.85} onPress={quickAdd} label={`Quick add ${m.name} to cart`} style={{ position: 'absolute', bottom: 9, right: 9 }} hitSlop={8}>
            <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
              <Icon name="plus" size={18} color="#fff" />
            </View>
          </Press>
          )}
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
              <Text style={[type(12.5, 800), { color: c.ink }]}>{m.rating} · {m.time}</Text>
            </View>
          </View>
        </View>
      </View>
    </Press>
  );
});

/** Today's drop — the calm white hero card on Home. */
export const HeroDrop = React.memo(function HeroDrop({ id }: { id: string }) {
  const c = useC();
  const router = useRouter();
  const { fav, toggleFav, addToCart, showFlash, isMine } = useStore();
  const m = mealById(id)!;
  const cook = COOKS[m.cook];
  const isFav = fav.has(m.id);
  const mine = isMine(m.cook);
  const add = () => {
    addToCart({ key: m.id, name: m.name, cook: m.cook, price: m.price, grad: m.grad }, 1);
    showFlash({ name: m.name, grad: m.grad });
  };
  return (
    <Press scale={0.985} onPress={() => router.push(`/meal/${m.id}`)} style={{ marginHorizontal: 20 }}>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.hero, overflow: 'hidden', ...shadow.card }}>
        <GradBox grad={m.grad} img={m.img} style={{ height: 210 }}>
          <View style={{ position: 'absolute', top: 14, left: 14, height: 30, borderRadius: radius.pill, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,.94)' }}>
            <Icon name="bolt" size={13} color={c.primary} />
            <Text style={[type(11, 900), { color: c.ink, textTransform: 'uppercase' }]}>Today’s drop</Text>
          </View>
          <Press scale={0.85} onPress={() => toggleFav(m.id)} style={{ position: 'absolute', top: 13, right: 13 }} hitSlop={8}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
              <Icon name={isFav ? 'heartFill' : 'heart'} size={15} color={isFav ? c.primary : c.soft} />
            </View>
          </Press>
        </GradBox>
        <View style={{ padding: 18 }}>
          <Text style={[type(21, 900), { color: c.ink, letterSpacing: -0.6 }]}>{m.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <GradBox grad={cook.grad} style={{ width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type(12, 900), { color: '#fff' }]}>{cook.initial}</Text>
            </GradBox>
            <Text style={[type(13.5, 700), { color: c.soft }]}>{cook.kitchen}</Text>
            <VChk />
          </View>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
            <Meta icon="star" text={String(m.rating)} starColor />
            <Meta icon="walk" text={m.dist} />
            <Meta icon="clock" text={m.time} />
          </View>
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
    </Press>
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
