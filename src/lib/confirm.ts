import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm/destructive-action dialog. `Alert.alert` is a documented no-op on
 * react-native-web (https://necolas.github.io/react-native-web/docs/alert/) -- it neither shows
 * anything nor calls any button's onPress, so every Alert.alert-based confirmation on web
 * silently did nothing (found while auth-testing "Delete account": clicking it had zero effect,
 * no dialog, no API call). Falls back to `window.confirm` on web; native platforms keep the
 * real Alert.alert UI unchanged.
 */
export function confirmAction(title: string, message: string, onConfirm: () => void, confirmLabel = 'Delete') {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
