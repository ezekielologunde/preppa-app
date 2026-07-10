/**
 * DataTable — a columnar, high-density table for the admin console.
 *
 * Replaces the hand-rolled `Block` stacks: real header row, aligned columns,
 * skeleton loading, empty + error states, optional search, keyboard-openable
 * rows. Fully tokenized (adapts to dark mode); horizontally scrollable at narrow
 * widths so columns never crush. Web-first (the admin is web-only) but renders
 * fine anywhere.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import { useC } from '../../theme/ThemeContext';
import { type, radius } from '../../theme/theme';
import { Press, Icon } from '../../ui';
import { Empty } from '../../ui/layout';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Fixed column width in px. Omit to flex. */
  width?: number;
  /** Flex weight when no fixed width (default 1). */
  flex?: number;
  align?: 'left' | 'right' | 'center';
  /** Hide this column when the viewport is narrower than this width. */
  hideBelow?: number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  onRowPress?: (row: T) => void;
  rowLabel?: (row: T) => string;
  loading?: boolean;
  /** Minimum content width (px) before the table scrolls horizontally. */
  minWidth?: number;
  empty?: { icon: string; title: string; body: string };
  /** Enable an in-table search box; provide the searchable text for a row. */
  search?: { placeholder?: string; value: (row: T) => string };
}

const justify = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'flex-end' : a === 'center' ? 'center' : 'flex-start';

export function DataTable<T>({
  columns,
  rows,
  keyOf,
  onRowPress,
  rowLabel,
  loading,
  minWidth = 640,
  empty,
  search,
}: DataTableProps<T>) {
  const c = useC();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');

  const cols = useMemo(() => columns.filter((col) => !col.hideBelow || width >= col.hideBelow), [columns, width]);

  const filtered = useMemo(() => {
    if (!search || !q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => search.value(r).toLowerCase().includes(needle));
  }, [rows, q, search]);

  const cellStyle = (col: Column<T>) =>
    col.width
      ? { width: col.width, alignItems: justify(col.align) as any }
      : { flex: col.flex ?? 1, minWidth: 0, alignItems: justify(col.align) as any };

  return (
    <View style={{ marginHorizontal: 16, marginTop: 14 }}>
      {search ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border2,
            borderRadius: radius.md,
            paddingHorizontal: 12,
            height: 42,
            marginBottom: 10,
          }}
        >
          <Icon name="search" size={16} color={c.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={search.placeholder ?? 'Search'}
            placeholderTextColor={c.muted}
            accessibilityLabel={search.placeholder ?? 'Search'}
            style={[type(14, 600), { color: c.ink, flex: 1, height: 42 }]}
          />
          {q ? (
            <Press onPress={() => setQ('')} label="Clear search" hitSlop={8}>
              <Icon name="x" size={15} color={c.muted} />
            </Press>
          ) : null}
        </View>
      ) : null}

      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, overflow: 'hidden' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: '100%' }}>
          <View style={{ minWidth, flexGrow: 1 }}>
            {/* header */}
            <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.bg2 }}>
              {cols.map((col) => (
                <View key={col.key} style={cellStyle(col)}>
                  <Text style={[type(10.5, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4 }]} numberOfLines={1}>
                    {col.header}
                  </Text>
                </View>
              ))}
            </View>

            {/* body */}
            {loading ? (
              <SkeletonRows cols={cols} cellStyle={cellStyle} />
            ) : filtered.length === 0 ? (
              <View style={{ paddingVertical: 8 }}>
                <Empty
                  icon={empty?.icon ?? 'search'}
                  title={q ? 'No matches' : empty?.title ?? 'Nothing here yet'}
                  body={q ? `No rows match “${q}”.` : empty?.body ?? ''}
                />
              </View>
            ) : (
              filtered.map((row, i) => {
                const content = (
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 13,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: c.border2,
                      alignItems: 'center',
                    }}
                  >
                    {cols.map((col) => (
                      <View key={col.key} style={cellStyle(col)}>
                        {col.render(row)}
                      </View>
                    ))}
                    {onRowPress ? <Icon name="chevRight" size={15} color={c.muted} /> : null}
                  </View>
                );
                return onRowPress ? (
                  <Press key={keyOf(row)} scale={0.997} onPress={() => onRowPress(row)} label={rowLabel?.(row)}>
                    {content}
                  </Press>
                ) : (
                  <View key={keyOf(row)}>{content}</View>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function SkeletonRows<T>({ cols, cellStyle }: { cols: Column<T>[]; cellStyle: (col: Column<T>) => any }) {
  const c = useC();
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 15, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border2 }}
        >
          {cols.map((col, j) => (
            <View key={col.key} style={cellStyle(col)}>
              <View style={{ height: 12, width: j === 0 ? '70%' : '45%', borderRadius: 6, backgroundColor: c.bg2 }} />
            </View>
          ))}
        </View>
      ))}
    </>
  );
}
