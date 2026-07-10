import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, tnum } from '../../src/theme/theme';
import { Screen, Btn } from '../../src/ui';
import { Sheet } from '../../src/ui/overlay';
import * as admin from '../../src/lib/admin';
import { DataTable, Column } from '../../src/components/admin/DataTable';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { fmtDateTime, humanize } from '../../src/components/admin/format';

const PAGE = 50;

export default function AdminAudit() {
  const c = useC();
  const [rows, setRows] = useState<admin.AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [sel, setSel] = useState<admin.AdminAuditEntry | null>(null);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      const page = await admin.listAudit({ limit: PAGE });
      setRows(page);
      setDone(page.length < PAGE);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  const loadOlder = async () => {
    if (rows.length === 0) return;
    setMore(true);
    try {
      const page = await admin.listAudit({ limit: PAGE, before: rows[rows.length - 1].created_at });
      setRows((prev) => [...prev, ...page]);
      if (page.length < PAGE) setDone(true);
    } catch (e) {
      setError(e as Error);
    } finally {
      setMore(false);
    }
  };

  const columns: Column<admin.AdminAuditEntry>[] = [
    {
      key: 'action',
      header: 'Action',
      flex: 1.5,
      render: (a) => (
        <View style={{ minWidth: 0 }}>
          <Text style={[type(14, 800), { color: c.ink }]} numberOfLines={1}>{humanize(a.action)}</Text>
          {a.entity ? <Text style={[type(11.5, 600), { color: c.muted }]} numberOfLines={1}>{a.entity}{a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ''}</Text> : null}
        </View>
      ),
    },
    { key: 'actor', header: 'Actor', flex: 1, hideBelow: 640, render: (a) => <Text style={[type(13, 600), { color: c.soft }]} numberOfLines={1}>{a.actor_name ?? 'system'}</Text> },
    { key: 'when', header: 'When', width: 138, align: 'right', render: (a) => <Text style={[type(12.5, 600), { color: c.muted }]}>{fmtDateTime(a.created_at)}</Text> },
  ];

  return (
    <Screen max={980}>
      <AdminHeader title="Audit log" sub={loading ? 'Loading…' : `${rows.length} events`} back={true} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {error && rows.length === 0 ? (
          <ErrorRetry message={error.message} onRetry={loadFirst} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(a) => a.id}
              onRowPress={setSel}
              rowLabel={(a) => `${humanize(a.action)} details`}
              loading={loading}
              minWidth={560}
              search={{ placeholder: 'Search action, actor, entity…', value: (a) => `${a.action} ${a.actor_name ?? ''} ${a.entity ?? ''}` }}
              empty={{ icon: 'clock', title: 'No audit events', body: 'Admin actions are recorded here.' }}
            />
            {!loading && rows.length > 0 && !done ? (
              <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                <Btn label={more ? 'Loading…' : 'Load older'} variant="ghost" loading={more} onPress={loadOlder} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={!!sel} onClose={() => setSel(null)} title="Audit event" scroll>
        {sel ? (
          <View style={{ gap: 12, paddingBottom: 8 }}>
            <ARow c={c} k="Action" v={humanize(sel.action)} />
            <ARow c={c} k="Actor" v={sel.actor_name ?? 'system'} />
            <ARow c={c} k="Entity" v={sel.entity ?? '—'} />
            {sel.entity_id ? <ARow c={c} k="Entity ID" v={sel.entity_id} mono /> : null}
            <ARow c={c} k="When" v={fmtDateTime(sel.created_at)} />
            <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }]}>Metadata</Text>
            <View style={{ backgroundColor: c.bg2, borderRadius: radius.md, padding: 12 }}>
              <Text style={[type(12.5, 600), { color: c.soft }, tnum]}>
                {sel.meta && Object.keys(sel.meta).length ? JSON.stringify(sel.meta, null, 2) : 'None'}
              </Text>
            </View>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function ARow({ c, k, v, mono }: { c: any; k: string; v: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={[type(13, 700), { color: c.muted, width: 90 }]}>{k}</Text>
      <Text style={[type(13.5, 600), { color: c.ink, flex: 1 }, mono ? tnum : null]}>{v}</Text>
    </View>
  );
}
