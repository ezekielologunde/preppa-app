import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useC } from '../../src/theme/ThemeContext';
import { type, tnum, radius } from '../../src/theme/theme';
import { Screen, Press, Btn } from '../../src/ui';
import { StatusTag } from '../../src/ui/layout';
import { Sheet } from '../../src/ui/overlay';
import { useStore } from '../../src/store/store';
import { useAdminUsers } from '../../src/data/hooks';
import * as admin from '../../src/lib/admin';
import { DataTable, Column } from '../../src/components/admin/DataTable';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { fmtDate, humanize, roleTone } from '../../src/components/admin/format';

export default function AdminUsers() {
  const c = useC();
  const { toast } = useStore();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useAdminUsers(nonce);
  const [target, setTarget] = useState<admin.AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const refetch = () => setNonce((n) => n + 1);

  // Audit Critical #10: there was no capability anywhere to suspend/reinstate an
  // already-verified kitchen, despite the Cook Agreement promising Preppa can do exactly
  // that. This is the admin surface for it.
  const doSuspend = async () => {
    if (!target?.kitchen_id) return;
    if (reason.trim().length < 3) { toast('Add a short reason to suspend', 'info'); return; }
    setBusy(true);
    try {
      await admin.suspendKitchen(target.kitchen_id, reason.trim());
      toast(`Suspended ${target.kitchen_name ?? 'kitchen'}`, 'x');
      setTarget(null); setReason(''); refetch();
    } catch (e: any) {
      toast(e?.message ?? 'Suspend failed', 'info');
    } finally { setBusy(false); }
  };
  const doReinstate = async (u: admin.AdminUser) => {
    if (!u.kitchen_id) return;
    setBusy(true);
    try {
      await admin.reinstateKitchen(u.kitchen_id);
      toast(`Reinstated ${u.kitchen_name ?? 'kitchen'}`, 'check', true);
      refetch();
    } catch (e: any) {
      toast(e?.message ?? 'Reinstate failed', 'info');
    } finally { setBusy(false); }
  };

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
    { key: 'verif', header: 'Verification', width: 118, hideBelow: 620, render: (u) => (u.verification_status ? <StatusTag label={humanize(u.verification_status)} tone={u.verification_status === 'verified' ? 'success' : u.verification_status === 'suspended' ? 'danger' : 'neutral'} /> : <Text style={[type(12.5, 600), { color: c.muted }]}>—</Text>) },
    { key: 'joined', header: 'Joined', width: 80, hideBelow: 700, render: (u) => <Text style={[type(12.5, 600), { color: c.muted }]}>{fmtDate(u.created_at)}</Text> },
    {
      key: 'action', header: '', width: 100, render: (u) => {
        if (!u.kitchen_id) return null;
        if (u.verification_status === 'verified') {
          return <Press scale={0.95} onPress={() => { setTarget(u); setReason(''); }}><Text style={[type(12.5, 800), { color: c.red }]}>Suspend</Text></Press>;
        }
        if (u.verification_status === 'suspended') {
          return <Press scale={0.95} onPress={() => doReinstate(u)}><Text style={[type(12.5, 800), { color: c.green }]}>Reinstate</Text></Press>;
        }
        return null;
      },
    },
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
          Read-only except kitchen suspension. Role changes are a privileged action handled separately.
        </Text>
      </ScrollView>

      <Sheet visible={!!target} onClose={() => setTarget(null)} title={`Suspend ${target?.kitchen_name ?? 'kitchen'}`}>
        <Text style={[type(13, 600), { color: c.soft, marginBottom: 10 }]}>
          This immediately removes the kitchen from search/checkout and blocks new orders. The
          owner keeps read access to their own history and can be reinstated anytime.
        </Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Reason (required, shown to the owner)"
          placeholderTextColor={c.muted}
          multiline
          style={{ minHeight: 64, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 12, color: c.ink, backgroundColor: c.bg2, textAlignVertical: 'top', ...(type(14, 600) as object) }}
        />
        <View style={{ marginTop: 12 }}>
          <Btn label="Suspend kitchen" variant="ghost" loading={busy} disabled={busy} onPress={doSuspend} />
        </View>
      </Sheet>
    </Screen>
  );
}
