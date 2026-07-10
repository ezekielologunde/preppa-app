import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useC } from '../../src/theme/ThemeContext';
import { type, tnum } from '../../src/theme/theme';
import { Screen } from '../../src/ui';
import { StatusTag } from '../../src/ui/layout';
import { useAdminUsers } from '../../src/data/hooks';
import * as admin from '../../src/lib/admin';
import { DataTable, Column } from '../../src/components/admin/DataTable';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { fmtDate, humanize, roleTone } from '../../src/components/admin/format';

export default function AdminUsers() {
  const c = useC();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useAdminUsers(nonce);

  const columns: Column<admin.AdminUser>[] = [
    {
      key: 'name',
      header: 'Name',
      flex: 1.4,
      render: (u) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[type(13, 900), { color: c.soft }]}>{(u.display_name ?? '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={[type(14, 700), { color: c.ink }]} numberOfLines={1}>{u.display_name ?? 'Unnamed'}</Text>
        </View>
      ),
    },
    { key: 'role', header: 'Role', width: 96, render: (u) => <StatusTag label={u.role} tone={roleTone(u.role)} /> },
    { key: 'kitchen', header: 'Kitchen', flex: 1, hideBelow: 760, render: (u) => <Text style={[type(13, 600), { color: c.soft }]} numberOfLines={1}>{u.kitchen_name ?? '—'}</Text> },
    { key: 'verif', header: 'Verification', width: 118, hideBelow: 620, render: (u) => (u.verification_status ? <StatusTag label={humanize(u.verification_status)} tone={u.verification_status === 'verified' ? 'success' : 'neutral'} /> : <Text style={[type(12.5, 600), { color: c.muted }]}>—</Text>) },
    { key: 'joined', header: 'Joined', width: 80, hideBelow: 700, render: (u) => <Text style={[type(12.5, 600), { color: c.muted }]}>{fmtDate(u.created_at)}</Text> },
  ];

  return (
    <Screen max={1000}>
      <AdminHeader title="Users" sub={loading ? 'Loading…' : `${data?.length ?? 0} accounts`} back={true} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {error ? (
          <ErrorRetry message={error.message} onRetry={() => setNonce((n) => n + 1)} />
        ) : (
          <DataTable
            columns={columns}
            rows={data ?? []}
            keyOf={(u) => u.user_id}
            loading={loading}
            minWidth={640}
            search={{ placeholder: 'Search name, kitchen…', value: (u) => `${u.display_name ?? ''} ${u.kitchen_name ?? ''} ${u.role}` }}
            empty={{ icon: 'users', title: 'No users', body: 'Signed-up accounts will appear here.' }}
          />
        )}
        <Text style={[type(12, 600), { color: c.muted, textAlign: 'center', marginTop: 16, paddingHorizontal: 30, lineHeight: 18 }]}>
          Read-only. Role changes are a privileged action handled separately.
        </Text>
      </ScrollView>
    </Screen>
  );
}
