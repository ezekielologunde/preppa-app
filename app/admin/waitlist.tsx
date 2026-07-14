import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, tnum } from '../../src/theme/theme';
import { Screen, Btn } from '../../src/ui';
import { Sheet } from '../../src/ui/overlay';
import * as admin from '../../src/lib/admin';
import { DataTable, Column } from '../../src/components/admin/DataTable';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { fmtDateTime } from '../../src/components/admin/format';
import { useStore } from '../../src/store/store';

const PAGE = 50;

export default function AdminWaitlist() {
  const c = useC();
  const { toast } = useStore();
  const [rows, setRows] = useState<admin.AdminWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [sel, setSel] = useState<admin.AdminWaitlistEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      const page = await admin.listWaitlist({ limit: PAGE });
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
      const page = await admin.listWaitlist({ limit: PAGE, before: rows[rows.length - 1].created_at });
      setRows((prev) => [...prev, ...page]);
      if (page.length < PAGE) setDone(true);
    } catch (e) {
      setError(e as Error);
    } finally {
      setMore(false);
    }
  };

  const confirmDelete = (entry: admin.AdminWaitlistEntry) => {
    Alert.alert(
      'Delete signup',
      `Remove ${entry.email} from the waitlist? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await admin.deleteWaitlistEntry(entry.id);
              setRows((prev) => prev.filter((r) => r.id !== entry.id));
              setSel(null);
              toast('Signup deleted', 'check', true);
            } catch (e: any) {
              toast(e?.message ?? 'Delete failed', 'info');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const columns: Column<admin.AdminWaitlistEntry>[] = [
    {
      key: 'email',
      header: 'Email',
      flex: 1.5,
      render: (w) => <Text style={[type(14, 700), { color: c.ink }]} numberOfLines={1}>{w.email}</Text>,
    },
    { key: 'zip', header: 'ZIP', flex: 0.6, hideBelow: 640, render: (w) => <Text style={[type(13, 600), { color: c.soft }]}>{w.zip ?? '—'}</Text> },
    { key: 'source', header: 'Source', flex: 0.8, hideBelow: 780, render: (w) => <Text style={[type(13, 600), { color: c.soft }]} numberOfLines={1}>{w.source ?? '—'}</Text> },
    { key: 'when', header: 'Joined', width: 138, align: 'right', render: (w) => <Text style={[type(12.5, 600), { color: c.muted }]}>{fmtDateTime(w.created_at)}</Text> },
  ];

  return (
    <Screen max={980}>
      <AdminHeader title="Waitlist" sub={loading ? 'Loading…' : `${rows.length} signups`} back={true} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {error && rows.length === 0 ? (
          <ErrorRetry message={error.message} onRetry={loadFirst} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(w) => w.id}
              onRowPress={setSel}
              rowLabel={(w) => `${w.email} details`}
              loading={loading}
              minWidth={560}
              search={{ placeholder: 'Search email, ZIP, source…', value: (w) => `${w.email} ${w.zip ?? ''} ${w.source ?? ''}` }}
              empty={{ icon: 'bell', title: 'No waitlist signups yet', body: 'Visitors who join the waitlist on preppa.live show up here.' }}
            />
            {!loading && rows.length > 0 && !done ? (
              <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                <Btn label={more ? 'Loading…' : 'Load older'} variant="ghost" loading={more} onPress={loadOlder} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={!!sel} onClose={() => setSel(null)} title="Waitlist signup" scroll>
        {sel ? (
          <View style={{ gap: 12, paddingBottom: 8 }}>
            <ARow c={c} k="Email" v={sel.email} />
            <ARow c={c} k="ZIP" v={sel.zip ?? '—'} />
            <ARow c={c} k="Source" v={sel.source ?? '—'} />
            <ARow c={c} k="Joined" v={fmtDateTime(sel.created_at)} />
            <Btn
              label="Delete signup"
              variant="ghost"
              loading={deleting}
              onPress={() => confirmDelete(sel)}
              style={{ backgroundColor: c.redL, marginTop: 8 }}
            />
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
