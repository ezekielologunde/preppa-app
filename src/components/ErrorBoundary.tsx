import React from 'react';
import { View, Text } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type } from '../theme/theme';
import { Icon, Btn } from '../ui';

function Fallback({ onReset }: { onReset: () => void }) {
  const c = useC();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <View style={{ width: 76, height: 76, borderRadius: 24, backgroundColor: c.pinkL, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="info" size={30} color={c.red} />
      </View>
      <Text style={[type(19, 900), { color: c.ink, marginTop: 18 }]}>Something went wrong</Text>
      <Text style={[type(14, 500), { color: c.soft, textAlign: 'center', maxWidth: 260, marginTop: 8, lineHeight: 21 }]}>
        The app hit an unexpected error. Your data is safe — try again.
      </Text>
      <View style={{ marginTop: 20 }}>
        <Btn label="Try again" icon="repeat" onPress={onReset} />
      </View>
    </View>
  );
}

/** Catches render errors below it and shows a recoverable fallback (per council: no white-screen crashes). */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    if (__DEV__) console.warn('ErrorBoundary caught:', error);
  }
  render() {
    if (this.state.error) return <Fallback onReset={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
