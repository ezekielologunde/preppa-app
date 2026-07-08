import React from 'react';
import { View, Text } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useC } from '../theme/ThemeContext';
import { type, radius, shadow } from '../theme/theme';
import { useStore } from '../store/store';
import { Icon, Press } from '../ui';
import { FLAGS } from '../config/flags';

const ITEMS = [
  { id: 'home', ico: 'home', lbl: 'Home', path: '/home' },
  { id: 'experiences', ico: 'grid', lbl: 'Experiences', path: '/experiences' },
  { id: 'feeds', ico: 'video', lbl: 'Feed', path: '/feeds' },
  { id: 'my-hub', ico: 'chefhat', lbl: 'My Hub', path: '/my-hub' },
  { id: 'profile', ico: 'user', lbl: 'Profile', path: '/profile' },
];

/** Persistent left navigation rail for tablet (icon-only) and desktop (labeled). */
export function SideRail({ width }: { width: number }) {
  const c = useC();
  const router = useRouter();
  const pathname = usePathname();
  const { cartCount, notifCount, prepperStatus } = useStore();
  const labeled = width >= 200;
  const items = ITEMS.filter((it) => {
    if (it.id === 'my-hub') return prepperStatus === 'approved'; // prepper-only
    if (it.id === 'experiences') return FLAGS.experiences;
    if (it.id === 'feeds') return FLAGS.feed;
    return true;
  });
  const activeId = ITEMS.find((it) => pathname === it.path || pathname.startsWith(it.path + '/'))?.id ?? (pathname === '/' ? 'home' : undefined);

  const Item = ({ id, ico, lbl, onPress, badge }: { id?: string; ico: string; lbl: string; onPress: () => void; badge?: number }) => {
    const on = id && activeId === id;
    return (
      <Press scale={0.97} onPress={onPress}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: labeled ? 13 : 0, justifyContent: labeled ? 'flex-start' : 'center', paddingVertical: 12, paddingHorizontal: labeled ? 13 : 0, borderRadius: radius.md, backgroundColor: on ? c.primaryL : 'transparent' }}>
          <View>
            <Icon name={ico} size={22} color={on ? c.primaryD : c.soft} />
            {badge && badge > 0 ? (
              <View style={{ position: 'absolute', top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.surface }}>
                <Text style={[type(10, 900), { color: '#fff' }]}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {labeled ? <Text style={[type(15, 700), { color: on ? c.primaryD : c.soft }]}>{lbl}</Text> : null}
        </View>
      </Press>
    );
  };

  return (
    <View style={{ width, backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.border2, paddingVertical: 20, paddingHorizontal: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: labeled ? 10 : 0, justifyContent: labeled ? 'flex-start' : 'center', marginBottom: 14 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
          <Icon name="flame" size={18} color="#fff" />
        </View>
        {labeled ? <Text style={[type(19, 900), { color: c.ink, letterSpacing: -0.7 }]}>preppa</Text> : null}
      </View>

      {items.map((it) => (
        <Item key={it.id} id={it.id} ico={it.ico} lbl={it.lbl} onPress={() => router.navigate(it.path as any)} />
      ))}
      {FLAGS.notifications ? <Item ico="bell" lbl="Notifications" badge={notifCount} onPress={() => router.push('/notifications')} /> : null}
      <Item ico="cart" lbl="Cart" badge={cartCount} onPress={() => router.push('/cart')} />

      <View style={{ flex: 1 }} />

      <Press scale={0.97} onPress={() => router.navigate('/profile')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: labeled ? 12 : 0, justifyContent: labeled ? 'flex-start' : 'center', paddingHorizontal: labeled ? 8 : 0, paddingVertical: 8 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[type(15, 900), { color: '#fff' }]}>J</Text>
          </View>
          {labeled ? (
            <View>
              <Text style={[type(14, 800), { color: c.ink }]}>Jordan</Text>
              <Text style={[type(11.5, 600), { color: c.muted }]}>View profile</Text>
            </View>
          ) : null}
        </View>
      </Press>
    </View>
  );
}
