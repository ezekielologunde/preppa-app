/**
 * Command palette (⌘K / Ctrl+K) for the admin console + the chrome context that
 * drives it. Mounted once in the admin layout; any admin header can call
 * `useAdminChrome().openPalette()`. Keyboard-first: arrows move the selection,
 * Enter navigates, Esc closes. Web-only (the admin is web-only).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../theme/ThemeContext';
import { type, radius, shadow } from '../../theme/theme';
import { Icon } from '../../ui';

interface Command {
  label: string;
  hint: string;
  icon: string;
  route: string;
}

const COMMANDS: Command[] = [
  { label: 'Overview', hint: 'Dashboard home', icon: 'grid', route: '/admin' },
  { label: 'Applications', hint: 'Prepper review queue', icon: 'chefhat', route: '/admin/applications' },
  { label: 'Orders & payments', hint: 'Transactions', icon: 'bag', route: '/admin/orders' },
  { label: 'Support tickets', hint: 'Disputes & issues', icon: 'ticket', route: '/admin/tickets' },
  { label: 'Users', hint: 'Accounts & roles', icon: 'users', route: '/admin/users' },
  { label: 'Audit log', hint: 'Admin action trail', icon: 'clock', route: '/admin/audit' },
  { label: 'Back to app', hint: 'Leave admin', icon: 'logout', route: '/(tabs)/home' },
];

interface AdminChrome {
  openPalette: () => void;
}
const Ctx = createContext<AdminChrome>({ openPalette: () => {} });
export const useAdminChrome = () => useContext(Ctx);

export function AdminChromeProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);

  // Global ⌘K / Ctrl+K to open (web only).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Ctx.Provider value={{ openPalette }}>
      {children}
      <Palette open={open} onClose={() => setOpen(false)} />
    </Ctx.Provider>
  );
}

function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useC();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<TextInput>(null);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return COMMANDS;
    return COMMANDS.filter((cmd) => (cmd.label + ' ' + cmd.hint).toLowerCase().includes(needle));
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      // focus after the modal mounts
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (sel > results.length - 1) setSel(Math.max(0, results.length - 1));
  }, [results.length, sel]);

  const run = (cmd?: Command) => {
    const target = cmd ?? results[sel];
    if (!target) return;
    onClose();
    router.push(target.route as any);
  };

  const onKeyPress = (e: any) => {
    const key = e?.nativeEvent?.key;
    if (key === 'ArrowDown') {
      e.preventDefault?.();
      setSel((s) => Math.min(results.length - 1, s + 1));
    } else if (key === 'ArrowUp') {
      e.preventDefault?.();
      setSel((s) => Math.max(0, s - 1));
    } else if (key === 'Enter') {
      e.preventDefault?.();
      run();
    } else if (key === 'Escape') {
      e.preventDefault?.();
      onClose();
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close command palette"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.5)', alignItems: 'center', paddingTop: '8%', paddingHorizontal: 20 }}
      >
        <Pressable
          onPress={() => {}}
          accessibilityViewIsModal
          style={{ width: '100%', maxWidth: 560, backgroundColor: c.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: c.border, overflow: 'hidden', ...shadow.hero }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 54, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
            <Icon name="search" size={18} color={c.muted} />
            <TextInput
              ref={inputRef}
              value={q}
              onChangeText={setQ}
              onKeyPress={onKeyPress}
              placeholder="Search modules & actions…"
              placeholderTextColor={c.muted}
              accessibilityLabel="Command palette search"
              style={[type(16, 600), { color: c.ink, flex: 1, height: 54 }]}
            />
            <Text style={[type(11, 800), { color: c.muted, backgroundColor: c.bg2, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' }]}>ESC</Text>
          </View>

          <View style={{ paddingVertical: 6, maxHeight: 360 }}>
            {results.length === 0 ? (
              <Text style={[type(14, 600), { color: c.muted, textAlign: 'center', paddingVertical: 24 }]}>No matches</Text>
            ) : (
              results.map((cmd, i) => {
                const active = i === sel;
                return (
                  <Pressable
                    key={cmd.route}
                    onPress={() => run(cmd)}
                    onHoverIn={() => setSel(i)}
                    accessibilityRole="button"
                    accessibilityLabel={cmd.label}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: radius.md, backgroundColor: active ? c.bg2 : 'transparent' }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: active ? c.surface : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={cmd.icon} size={16} color={active ? c.primary : c.soft} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type(14.5, 800), { color: c.ink }]}>{cmd.label}</Text>
                      <Text style={[type(12, 600), { color: c.muted }]}>{cmd.hint}</Text>
                    </View>
                    {active ? <Icon name="chevRight" size={15} color={c.muted} /> : null}
                  </Pressable>
                );
              })
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
