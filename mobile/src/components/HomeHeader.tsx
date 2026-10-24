import { Pressable, StyleSheet, View } from 'react-native';
import { Copy, Glass } from './Primitives';
import { Icon } from './Icon';
import { theme } from '../theme';
export function HomeHeader({ firstName, count, onAssistant }: { firstName: string; count: number; onAssistant: () => void }) {
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return <>
    <View style={s.heading}><Copy weight="extra" accessibilityRole="header" style={s.title}>Bonjour {firstName}</Copy><Copy style={s.subtitle}>{date[0].toUpperCase() + date.slice(1)} · {count === 0 ? 'Tout est à jour' : `${count} ${count === 1 ? 'chose à faire' : 'choses à faire'}`}</Copy></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Assistant IA, parler ou poser une question" onPress={onAssistant} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Glass radius={36} style={s.pill}><Icon name="sparkles" color={theme.colors.gold} size={23}/><Copy style={s.pillText}><Copy weight="bold">Assistant IA</Copy> · parler ou poser une question</Copy></Glass>
    </Pressable>
  </>;
}
const s = StyleSheet.create({ heading: { gap: 3 }, title: { fontSize: 30, lineHeight: 39, letterSpacing: -0.9 }, subtitle: { color: theme.colors.muted }, pill: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 21 }, pillText: { flex: 1, color: theme.colors.muted, fontSize: 15, lineHeight: 21 } });
