import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../theme/ThemeContext';
import { type } from '../theme/theme';
import { useStore } from '../store/store';
import { Icon, Btn } from '../ui';
import { Dialog } from '../ui/overlay';

/** One-time "you're approved" welcome — shown once per approval, acknowledged server-side. */
export function ApprovalWelcomeOverlay() {
  const c = useC();
  const router = useRouter();
  const { approvalNoticePending, ackApprovalNotice } = useStore();

  const dismiss = () => { ackApprovalNotice(); };
  const setUpPayouts = () => { ackApprovalNotice(); router.push('/hub/money'); };

  return (
    <Dialog visible={approvalNoticePending} onClose={dismiss} title="Welcome to Preppa!">
      <View style={{ alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
          <Icon name="check" size={26} color={c.primary} />
        </View>
      </View>
      <Text style={[type(14, 500), { color: c.soft, lineHeight: 20, textAlign: 'center' }]}>
        Your application has been approved. You can now set up your kitchen, create meal plans, and offer food services.
      </Text>
      <Text style={[type(14, 500), { color: c.soft, lineHeight: 20, textAlign: 'center' }]}>
        Before accepting paid orders, securely connect a bank account or eligible debit card so Preppa can send your earnings.
      </Text>
      <View style={{ gap: 10, marginTop: 6 }}>
        <Btn label="Set up payouts" icon="card" block onPress={setUpPayouts} />
        <Btn label="Do this later" variant="ghost" block onPress={dismiss} />
      </View>
    </Dialog>
  );
}
