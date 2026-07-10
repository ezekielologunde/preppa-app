import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { GradBox, Icon } from '../ui';
import type { GradKey } from '../theme/theme';

/**
 * Meal photo gallery: a paged, swipeable carousel with dot indicators, a photo
 * counter, desktop prev/next arrows, and tap-to-zoom (opens the full-screen
 * ImageViewer via `onOpen`). Falls back to a single static image when there's
 * one photo. `children` (hero top bar, badges) render fixed on top of the pager.
 */
export function MealGallery({
  photos,
  grad,
  height = 280,
  onOpen,
  children,
}: {
  photos: string[];
  grad: GradKey;
  height?: number;
  onOpen: (index: number) => void;
  children?: React.ReactNode;
}) {
  const c = useC();
  const { width: winW } = useWindowDimensions();
  const wide = winW >= 700;
  const [w, setW] = useState(0);
  const [idx, setIdx] = useState(0);
  const ref = useRef<ScrollView>(null);
  const multi = photos.length > 1;

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (w) setIdx(Math.round(e.nativeEvent.contentOffset.x / w));
  };
  const go = (to: number) => {
    const clamped = Math.max(0, Math.min(photos.length - 1, to));
    setIdx(clamped);
    ref.current?.scrollTo({ x: clamped * w, animated: true });
  };

  return (
    <View style={{ height }} onLayout={onLayout}>
      {w === 0 ? (
        // pre-measure: render the cover full-bleed so there's no flash of empty space
        <Pressable onPress={() => onOpen(0)} style={{ flex: 1 }} accessibilityLabel="View photo">
          <GradBox grad={grad} img={photos[0]} style={{ flex: 1 }} />
        </Pressable>
      ) : (
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          scrollEnabled={multi}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onEnd}
        >
          {photos.map((p, i) => (
            <Pressable key={i} onPress={() => onOpen(i)} style={{ width: w, height }} accessibilityLabel={`View photo ${i + 1} of ${photos.length}`}>
              <GradBox grad={grad} img={p} style={{ width: w, height }} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {children}

      {multi ? (
        <>
          {/* dots */}
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            {photos.map((_, i) => (
              <View key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,.55)' }} />
            ))}
          </View>
          {/* counter */}
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 34, right: 16, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(0,0,0,.5)', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="search" size={12} color="#fff" />
            <Text style={[type(11.5, 800), { color: '#fff', fontVariant: ['tabular-nums'] }]}>{idx + 1}/{photos.length}</Text>
          </View>
          {/* desktop arrows */}
          {wide ? (
            <>
              {idx > 0 ? <Arrow side="left" onPress={() => go(idx - 1)} /> : null}
              {idx < photos.length - 1 ? <Arrow side="right" onPress={() => go(idx + 1)} /> : null}
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function Arrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={side === 'left' ? 'Previous photo' : 'Next photo'}
      style={{ position: 'absolute', top: '50%', marginTop: -20, [side]: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,.5)', alignItems: 'center', justifyContent: 'center' } as any}
    >
      <Icon name={side === 'left' ? 'chevLeft' : 'chevRight'} size={22} color="#fff" />
    </Pressable>
  );
}
