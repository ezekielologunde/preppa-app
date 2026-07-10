/** Shared admin error state: a card explaining the failure with a Retry action. */
import React from 'react';
import { View, Text } from 'react-native';
import { useC } from '../../theme/ThemeContext';
import { type, radius } from '../../theme/theme';
import { Btn, Icon } from '../../ui';

export function ErrorRetry({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const c = useC();
  return (
    <View style={{ marginHorizontal: 16, marginTop: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, padding: 20, alignItems: 'center' }}>
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.redL, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="info" size={24} color={c.red} />
      </View>
      <Text style={[type(15.5, 900), { color: c.ink, marginTop: 14 }]}>Couldn’t load this</Text>
      <Text style={[type(13.5, 500), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 300, lineHeight: 20 }]}>
        {message ?? 'Something went wrong talking to the server.'}
      </Text>
      <View style={{ marginTop: 16 }}>
        <Btn label="Try again" icon="repeat" variant="dark" onPress={onRetry} />
      </View>
    </View>
  );
}
