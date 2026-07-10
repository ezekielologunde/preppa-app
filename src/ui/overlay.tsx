import React from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';

/**
 * Bottom sheet. Dimmed backdrop dismisses; content is anchored to the bottom
 * with a grabber + optional title. Pass `scroll` for long lists.
 * (Extracted from the LocationPicker/explore-filters scaffold so overlays stop
 * being copy-pasted.)
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  scroll,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const c = useC();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            paddingTop: 10,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 16,
            maxHeight: '88%',
          }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: 'center', marginBottom: 12 }} />
          {title ? <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.4, marginBottom: 8, paddingHorizontal: 4 }]}>{title}</Text> : null}
          {scroll ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Centered dialog for a short focused task (e.g. edit a field, confirm).
 * Dimmed backdrop dismisses via `onClose` (caller may guard while busy).
 */
export function Dialog({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const c = useC();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', paddingHorizontal: 28 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderRadius: radius.xl, padding: 20, gap: 14, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
          {title ? <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.4 }]}>{title}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
