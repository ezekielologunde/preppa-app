import React from 'react';
import { Modal, View, Image, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../ui';
import { type } from '../theme/theme';

/** Full-screen photo viewer. Tap the backdrop or the ✕ to close. */
export function ImageViewer({ uri, caption, visible, onClose }: { uri?: string; caption?: string; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!uri) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.94)', alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
        <Image source={{ uri }} resizeMode="contain" style={{ width: '100%', flex: 1 }} />
        {caption ? <Text style={[type(14, 700), { color: 'rgba(255,255,255,.85)', marginTop: 12, paddingHorizontal: 24, textAlign: 'center' }]}>{caption}</Text> : null}
        <Pressable onPress={onClose} accessibilityLabel="Close photo" style={{ position: 'absolute', top: insets.top + 12, right: 16, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,.16)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="x" size={20} color="#fff" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
