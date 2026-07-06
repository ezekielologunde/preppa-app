import React, { useEffect, useRef } from 'react';
import { Animated, Text } from 'react-native';
import { Icon } from '../ui/Icon';
import { type, shadow, FILL } from '../theme/theme';

/** Branded cold-launch splash: flame springs in, wordmark, fades out (~2.1s). */
export function SplashOverlay() {
  const op = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    Animated.spring(sc, { toValue: 1, useNativeDriver: true, bounciness: 12, speed: 5 }).start();
    Animated.timing(op, { toValue: 0, duration: 520, delay: 1560, useNativeDriver: true }).start();
  }, [op, sc]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[FILL, { backgroundColor: '#0E0E10', alignItems: 'center', justifyContent: 'center', opacity: op }]}
    >
      <Animated.View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: '#F26B1D', alignItems: 'center', justifyContent: 'center', transform: [{ scale: sc }], ...shadow.brand }}>
        <Icon name="flame" size={42} color="#fff" />
      </Animated.View>
      <Text style={[type(32, 900), { color: '#fff', letterSpacing: -1.3, marginTop: 20 }]}>preppa</Text>
    </Animated.View>
  );
}
