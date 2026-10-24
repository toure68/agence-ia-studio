import { StyleSheet, View } from 'react-native';
import { Copy, Glass, Button } from './Primitives';
import { IconTile } from './Icon';
import { theme } from '../theme';
export function SectorCard({ title, onPress }: { title: string; onPress: () => void }) {
  return <Glass tone="blue" style={s.card}><View style={s.row}><IconTile name="news" tone="blue"/><View style={s.text}><Copy style={s.label}>Votre secteur cette semaine</Copy><Copy weight="bold" style={s.title}>{title}</Copy></View></View><Button title="Lire en 30 s" secondary onPress={onPress}/></Glass>;
}
const s = StyleSheet.create({ card: { gap: 15 }, row: { flexDirection: 'row', alignItems: 'center', gap: 14 }, text: { flex: 1, gap: 3 }, label: { color: theme.colors.muted }, title: { fontSize: 15, lineHeight: 21 } });
