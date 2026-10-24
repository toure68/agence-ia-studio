import Svg, { Path, Rect, Circle, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { theme, type Tone } from '../theme';
import type { IconName } from '../models';

export function Icon({ name, color = theme.colors.text, size = 24 }: { name: IconName; color?: string; size?: number }) {
  const shapes: Record<IconName, React.ReactNode> = {
    sparkles: <><Path d="m10 3 2.3 5.7L18 11l-5.7 2.3L10 19l-2.3-5.7L2 11l5.7-2.3L10 3Z"/><Path d="m19 15 1.2 2.8L23 19l-2.8 1.2L19 23l-1.2-2.8L15 19l2.8-1.2L19 15Z"/></>,
    layers: <><Path d="m12 3 10 5-10 5L2 8l10-5Z"/><Path d="m2 12 10 5 10-5M2 16l10 5 10-5"/></>,
    quote: <><Path d="M6 2h9l4 4v16H6Z"/><Path d="M14 2v5h5m-10 7 2 2 5-5"/></>,
    case: <><Rect x="3" y="7" width="18" height="14" rx="2"/><Path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3"/></>,
    folder: <Path d="M3 5h6l2 3h10v12H3Z"/>,
    news: <><Rect x="4" y="3" width="16" height="18" rx="1"/><Path d="M8 7h8M8 11h8M8 15h5"/></>,
    user: <><Circle cx="12" cy="7" r="4"/><Path d="M4 22v-3a8 8 0 0 1 16 0v3"/></>,
    calendar: <><Rect x="3" y="5" width="18" height="16" rx="2"/><Path d="M7 2v6m10-6v6M3 11h18"/></>,
    inbox: <><Path d="M4 3h16v18H4ZM4 14h4l2 3h4l2-3h4"/><Path d="M8 7h8m-8 4h6"/></>,
    x: <Path d="m6 6 12 12M6 18 18 6"/>,
    clock: <><Circle cx="12" cy="12" r="9"/><Path d="M12 6v6l4 2"/></>,
    settings: <><Path d="M4 6h16M4 12h16M4 18h16"/><Circle cx="8" cy="6" r="2" fill={theme.colors.background}/><Circle cx="16" cy="12" r="2" fill={theme.colors.background}/><Circle cx="10" cy="18" r="2" fill={theme.colors.background}/></>,
    chevron: <Path d="m9 5 7 7-7 7"/>,
    check: <Path d="m5 12 5 5L20 7"/>,
    search: <><Circle cx="10" cy="10" r="7"/><Path d="m15 15 6 6"/></>,
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><G stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</G></Svg>;
}

export function IconTile({ name, tone, size = theme.size.icon }: { name: IconName; tone: Tone; size?: number }) {
  return <LinearGradient colors={theme.iconGlass} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tile, { width: size, height: size, borderColor: theme.colors[tone], borderRadius: size * 0.3 }]}><Icon name={name} color={theme.colors[tone]} size={size * 0.46}/></LinearGradient>;
}
const styles = StyleSheet.create({ tile: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 } });
