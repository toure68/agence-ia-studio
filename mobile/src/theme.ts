// Référence visuelle « Accueil simplifié », 18 octobre 2026.
// Valeurs indépendantes de la densité : points natifs / pixels CSS sur le web.
export const theme = {
  version: 'accueil-verre-2026-10-18',
  colors: {
    background: '#07090D', text: '#F2F5F7', muted: '#8B97A3',
    green: '#4ADE80', gold: '#E2B04A', red: '#F2616B', blue: '#5BB0FF',
    border: 'rgba(255,255,255,0.10)', surface: '#0D1015',
  },
  glass: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)'] as const,
  iconGlass: ['#3A3D44', '#14171C'] as const,
  radius: { card: 24, module: 20, button: 14, icon: 15 },
  spacing: { side: 20, block: 20, gap: 10, card: 18 },
  size: { icon: 48, moduleIcon: 40, button: 48, touch: 44 },
  fonts: { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold', extra: 'Manrope_800ExtraBold' },
} as const;
export type Tone = 'green' | 'gold' | 'red' | 'blue';
