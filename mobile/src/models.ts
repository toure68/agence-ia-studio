import type { Tone } from './theme';
export type IconName = 'sparkles' | 'layers' | 'quote' | 'case' | 'folder' | 'news' | 'user' | 'calendar' | 'inbox' | 'x' | 'clock' | 'settings' | 'chevron' | 'check' | 'search';
export type Action = {
  id: string; kind: 'quote' | 'equipment' | 'document'; title: string;
  description: string; button: string; icon: IconName; tone: Tone;
  urgency: number; importance: number; important?: boolean;
};
export type Module = { id: string; name: string; count: number; icon: IconName; tone: Tone };
export type HomeData = {
  firstName: string; balance: number; receivable: number; payable: number;
  currency: 'EUR'; actions: Action[]; modules: Module[];
  insight: { title: string; summary: string };
};
export const euro = (amount: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
export function selectActions(actions: Action[], hidden: Set<string>) {
  return actions.filter(a => !hidden.has(a.id)).sort((a, b) => b.urgency - a.urgency || b.importance - a.importance).slice(0, 3);
}
// Des rangées complètes : l'excédent reste dans « Tous les modules ».
export function selectModules(modules: Module[], columns: number) {
  const eligible = modules.filter(m => m.count > 0);
  const limit = Math.min(6, eligible.length);
  return eligible.slice(0, Math.floor(limit / columns) * columns);
}
