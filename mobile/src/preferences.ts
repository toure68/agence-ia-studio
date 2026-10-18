import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { theme } from './theme';

export type Columns = 2 | 3 | 4;
export type Preferences = { version: 1; columns: Columns; theme: string };
export type History = { current: Preferences; previous: Preferences | null };
export const DEFAULTS: Preferences = { version: 1, columns: 2, theme: theme.version };
export const STORAGE_KEY = 'agence-ia:mobile:home-preferences:v1';
export function isPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<Preferences>;
  return p.version === 1 && [2, 3, 4].includes(p.columns as number) && p.theme === theme.version;
}
export function parseHistory(raw: string | null): History {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (value && isPreferences(value.current)) return { current: value.current, previous: isPreferences(value.previous) ? value.previous : null };
  } catch { /* Préférence corrompue : garder un accueil utilisable. */ }
  return { current: { ...DEFAULTS }, previous: null };
}
export function usePreferences() {
  const [history, setHistory] = useState<History>({ current: DEFAULTS, previous: null });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = useRef(history);
  const busy = useRef(false);
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (mounted) { current.current = parseHistory(raw); setHistory(current.current); }
    }).catch(() => { /* Un message d'erreur sera affiché si l'écriture échoue. */ })
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  async function persist(next: History) {
    if (busy.current) return false;
    busy.current = true; setSaving(true);
    try {
      // Ancien et nouveau réglages sont sauvegardés ensemble avant l'affichage.
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      current.current = next; setHistory(next); return true;
    } finally { busy.current = false; setSaving(false); }
  }
  return {
    ...history, ready, saving,
    choose: (columns: Columns) => columns === current.current.current.columns ? Promise.resolve(false) : persist({ current: { ...current.current.current, columns }, previous: { ...current.current.current } }),
    restore: () => current.current.previous ? persist({ current: current.current.previous, previous: current.current.current }) : Promise.resolve(false),
  };
}
