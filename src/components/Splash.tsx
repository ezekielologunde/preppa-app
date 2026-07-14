import React, { useEffect, useRef } from 'react';
import { Animated, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../ui/Icon';
import { type, shadow, FILL, GRAD } from '../theme/theme';

/** Branded cold-launch splash: flame springs in on the brand gradient, wordmark,
 * fades out (~2.1s). Matches the Onboarding welcome step's gradient so there's no
 * jarring color swap between the two. */
export function SplashOverlay() {
  const op = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    Animated.spring(sc, { toValue: 1, useNativeDriver: true, bounciness: 12, speed: 5 }).start();
    Animated.timing(op, { toValue: 0, duration: 520, delay: 1560, useNativeDriver: true }).start();
  }, [op, sc]);
  return (
    <Animated.View pointerEvents="none" style={[FILL, { opacity: op }]}>
      <LinearGradient colors={GRAD.g4 as any} style={[FILL, { alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: 'rgba(255,255,255,.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,.3)', alignItems: 'center', justifyContent: 'center', transform: [{ scale: sc }], ...shadow.brand }}>
          <Icon name="flame" size={42} color="#fff" />
        </Animated.View>
        <Text style={[type(32, 900), { color: '#fff', letterSpacing: -1.3, marginTop: 20 }]}>preppa</Text>
      </LinearGradient>
    </Animated.View>
  );
}
