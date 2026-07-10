import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, tnum } from '../../src/theme/theme';
import { Screen, Icon, Press } from '../../src/ui';
import { StatusTag } from '../../src/ui/layout';
import { money } from '../../src/data/data';
import { useAdminOverview } from '../../src/data/hooks';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'brand' | 'plain' }) {
  const c = useC();
  return (
    <View style={{ flex: 1, minWidth: 150, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 16 }}>
      <Text style={[type(26, 900), { color: tone === 'brand' ? c.primary : c.ink, letterSpacing: -0.8 }, tnum]}>{value}</Text>
      <Text style={[type(12, 700), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }]}>{label}</Text>
    </View>
  );
}

function ModuleCard({ icon, title, sub, badge, onPress }: { icon: string; title: string; sub: string; badge?: string; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.99} onPress={onPress} label={title} style={{ flexGrow: 1, flexBasis: 260 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 16 }}>
        <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={21} color={c.ink} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[type(15.5, 900), { color: c.ink, letterSpacing: -0.3 }]}>{title}</Text>
            {badge ? <StatusTag label={badge} tone="brand" /> : null}
          </View>
          <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]} numberOfLines={1}>{sub}</Text>
        </View>
        <Icon name="chevRight" size={17} color={c.muted} />
      </View>
    </Press>
  );
}

export default function AdminHome() {
  const c = useC();
  const router = useRouter();
  const [nonce, setNonce] = React.useState(0);
  const { data, loading, error } = useAdminOverview(nonce);
  const pending = data?.pending_applications ?? 0;

  return (
    <Screen max={1040}>
      <AdminHeader title="Admin" sub="Operational control center" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, marginTop: 16 }}>
          <Stat label="Pending review" value={loading ? '—' : String(pending)} tone="brand" />
          <Stat label="Captured GMV" value={loading ? '—' : money((data?.gmv_cents ?? 0) / 100)} />
          <Stat label="Orders" value={loading ? '—' : String(data?.orders_count ?? 0)} />
          <Stat label="Verified kitchens" value={loading ? '—' : String(data?.verified_kitchens ?? 0)} />
          <Stat label="Preppers" value={loading ? '—' : String(data?.preppers ?? 0)} />
        </View>

        {error ? (
          <ErrorRetry message={error.message} onRetry={() => setNonce((n) => n + 1)} />
        ) : null}

        <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 26, marginBottom: 2, paddingHorizontal: 20 }]}>Modules</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, marginTop: 10 }}>
          <ModuleCard icon="chefhat" title="Applications" sub="Prepper verification queue" badge={pending > 0 ? String(pending) : undefined} onPress={() => router.push('/admin/applications')} />
          <ModuleCard icon="bag" title="Orders & payments" sub="Real transactions & Stripe status" onPress={() => router.push('/admin/orders')} />
          <ModuleCard icon="ticket" title="Support tickets" sub="Disputes & order issues" onPress={() => router.push('/admin/tickets')} />
          <ModuleCard icon="users" title="Users" sub="Accounts & roles" onPress={() => router.push('/admin/users')} />
          <ModuleCard icon="clock" title="Audit log" sub="Admin action trail" onPress={() => router.push('/admin/audit')} />
        </View>

        <Text style={[type(12, 600), { color: c.muted, textAlign: 'center', marginTop: 26, paddingHorizontal: 30, lineHeight: 18 }]}>
          Press ⌘K anywhere to jump between modules.
        </Text>
      </ScrollView>
    </Screen>
  );
}
