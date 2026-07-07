import React, { useEffect, useRef } from 'react';
import { Animated, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useC } from '../theme/ThemeContext';
import { type, radius, shadow } from '../theme/theme';
import { useStore } from '../store/store';
import { Icon, Press, GradBox } from '../ui';
import { useReducedMotion } from '../ui/useReducedMotion';

/**
 * A single, coalescing "Added to cart → View cart" overlay anchored at the app root
 * (above the tab bar / dock). Replaces rather than stacks; auto-dismisses; tappable
 * (unlike ToastHost which is pointerEvents:none). Respects reduce-motion.
 */
export function CartFlash() {
  const c = useC();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flash, dismissFlash } = useStore();
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!flash) return;
    if (reduced) { a.setValue(1); return; }
    a.setValue(0);
    Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
  }, [flash, reduced]);

  if (!flash) return null;
  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <Animated.View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 86, opacity: a, transform: [{ translateY }] }}>
      <Press scale={0.98} onPress={() => { dismissFlash(); router.push('/cart'); }} label={`${flash.name} added — view cart`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(20,20,22,.96)', borderRadius: radius.lg, padding: 10, paddingRight: 16, ...shadow.float }}>
          <GradBox grad={flash.grad} style={{ width: 42, height: 42, borderRadius: 12 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type(10.5, 800), { color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: 0.4 }]}>Added to cart</Text>
            <Text numberOfLines={1} style={[type(14, 800), { color: '#fff', marginTop: 1 }]}>{flash.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[type(14, 800), { color: c.primary }]}>View cart</Text>
            <Icon name="arrow" size={16} color={c.primary} />
          </View>
        </View>
      </Press>
    </Animated.View>
  );
}
